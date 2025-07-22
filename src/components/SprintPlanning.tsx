import React, { useState, useMemo } from 'react';
import { WorkItem, Sprint, ResourcePlanningData } from '../types';
import { Calculator, Target, AlertTriangle, CheckCircle, ArrowRight, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { format, isBefore, isAfter } from 'date-fns';
import { calculateSprintCapacity, calculateSprintSkillCapacities, canWorkItemBeAssignedToSprint, canWorkItemStartInSprint, getBlockedWorkItems } from '../utils/dateUtils';
import { workItemsApi, transformers } from '../services/api';

interface SprintPlanningProps {
  data: ResourcePlanningData;
  onUpdateWorkItems: (workItems: WorkItem[]) => void;
  onUpdateSprints: (sprints: Sprint[]) => void;
}

export const SprintPlanning: React.FC<SprintPlanningProps> = ({
  data,
  onUpdateWorkItems,
  onUpdateSprints
}) => {
  const [selectedSprint, setSelectedSprint] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());

  // Toggle epic expansion
  const toggleEpicExpansion = (epicId: string) => {
    const newExpanded = new Set(expandedEpics);
    if (newExpanded.has(epicId)) {
      newExpanded.delete(epicId);
    } else {
      newExpanded.add(epicId);
    }
    setExpandedEpics(newExpanded);
  };

  // Get unassigned work items (exclude epic children - they'll be shown under parent epics)
  const unassignedItems = data.workItems.filter(item => 
    item.assignedSprints.length === 0 && 
    item.status !== 'Completed' &&
    !item.isEpic && // Not an epic work item
    !item.epicId   // Not an epic child (they'll be grouped under parent)
  );

  // Get blocked work items (have unfinished dependencies)
  const blockedItems = getBlockedWorkItems(unassignedItems, data.workItems);
  const readyItems = unassignedItems.filter(item => !blockedItems.includes(item));

  // Get epic work items with unassigned children (work items with isEpic: true)
  const unassignedEpicWorkItems = data.workItems.filter(item => 
    item.isEpic && 
    item.status !== 'Completed' &&
    item.children && item.children.length > 0 && // Show epics that have children
    item.children.some(child => child.assignedSprints.length === 0 && child.status !== 'Completed') // At least one unassigned child
  );



  // Debug logging for epic work items
  React.useEffect(() => {
    console.log('🔍 Sprint Planning Epic Debug:');
    console.log('📊 All work items:', data.workItems.length);
    const epicWorkItems = data.workItems.filter(item => item.isEpic);
    console.log('📊 Work items with isEpic=true:', epicWorkItems);
    console.log('📊 Unassigned epic work items:', unassignedEpicWorkItems);
    
    // Check REF-2794 specifically
    const ref2794 = data.workItems.find(item => item.jiraId === 'REF-2794');
    if (ref2794) {
      console.log('📋 REF-2794 details:', {
        id: ref2794.id,
        jiraId: ref2794.jiraId,
        isEpic: ref2794.isEpic,
        hasChildren: !!ref2794.children,
        childrenCount: ref2794.children?.length || 0,
        children: ref2794.children,
        assignedSprints: ref2794.assignedSprints,
        status: ref2794.status,
        estimateStoryPoints: ref2794.estimateStoryPoints
      });
    }
  }, [data.workItems, unassignedEpicWorkItems]);

  // Get upcoming sprints (not in the past)
  const upcomingSprints = data.sprints.filter(sprint => 
    !isBefore(sprint.endDate, new Date())
  ).slice(0, 8); // Show next 8 sprints

  // Calculate sprint data with capacity and assignments
  const sprintData = useMemo(() => {
    return upcomingSprints.map(sprint => {
      // Get assigned top-level work items
      const assignedItems = data.workItems.filter(item => 
        item.assignedSprints.includes(sprint.id)
      );
      
      // Get assigned epic children
      const assignedEpicChildren: WorkItem[] = [];
      data.workItems.filter(item => item.isEpic && item.children).forEach(epic => {
        epic.children!.forEach(child => {
          if (child.assignedSprints.includes(sprint.id)) {
            assignedEpicChildren.push(child);
          }
        });
      });
      
      // NOTE: Epic children from data.epics are NOT included until manually converted to work items
      // This prevents epic children from appearing as if they're automatically work items
      
      // Combine all assigned items
      const allAssignedItems = [...assignedItems, ...assignedEpicChildren];
      const assignedPoints = allAssignedItems.reduce((sum, item) => sum + item.estimateStoryPoints, 0);
      
      // Calculate skill-specific capacities
      const skillCapacities = calculateSprintSkillCapacities(sprint, data.teamMembers, data.publicHolidays);
      const capacity = skillCapacities.total;
      
      // Calculate skill-specific assignments
      const frontendItems = allAssignedItems.filter(item => item.requiredSkills.includes('frontend'));
      const backendItems = allAssignedItems.filter(item => item.requiredSkills.includes('backend'));
      const frontendPoints = frontendItems.reduce((sum, item) => sum + item.estimateStoryPoints, 0);
      const backendPoints = backendItems.reduce((sum, item) => sum + item.estimateStoryPoints, 0);
      
      const utilization = capacity > 0 ? (assignedPoints / capacity) * 100 : 0;
      const frontendUtilization = skillCapacities.frontend > 0 ? (frontendPoints / skillCapacities.frontend) * 100 : 0;
      const backendUtilization = skillCapacities.backend > 0 ? (backendPoints / skillCapacities.backend) * 100 : 0;
      
      return {
        sprint,
        assignedItems: allAssignedItems,
        assignedPoints,
        capacity,
        utilization,
        availableCapacity: Math.max(0, capacity - assignedPoints),
        skillCapacities,
        frontendPoints,
        backendPoints,
        frontendUtilization,
        backendUtilization,
        availableFrontendCapacity: Math.max(0, skillCapacities.frontend - frontendPoints),
        availableBackendCapacity: Math.max(0, skillCapacities.backend - backendPoints)
      };
    });
  }, [upcomingSprints, data.workItems, data.teamMembers, data.publicHolidays]);

  // Auto-suggest sprint assignments based on deadlines and capacity
  const autoAssignItems = () => {
    const updatedWorkItems = [...data.workItems];
    const updatedSprints = [...data.sprints];
    
    // Clear existing assignments for auto-assignment
    unassignedItems.forEach(item => {
      const itemIndex = updatedWorkItems.findIndex(w => w.id === item.id);
      if (itemIndex >= 0) {
        updatedWorkItems[itemIndex] = {
          ...updatedWorkItems[itemIndex],
          assignedSprints: []
        };
      }
    });

    // Sort items by deadline (earliest first), but only include items that are ready
    const itemsToAssign = [...readyItems].sort((a, b) => 
      a.requiredCompletionDate.getTime() - b.requiredCompletionDate.getTime()
    );

    // Track available capacity for each sprint (skill-specific)
    const sprintCapacities = new Map(
      sprintData.map(sd => [sd.sprint.id, {
        total: sd.availableCapacity,
        frontend: sd.availableFrontendCapacity,
        backend: sd.availableBackendCapacity
      }])
    );

    itemsToAssign.forEach(item => {
      // Find the best sprint for this item
      const suitableSprints = sprintData.filter(sd => {
        // Sprint ends before or on the item's deadline
        if (isAfter(sd.sprint.endDate, item.requiredCompletionDate)) {
          return false;
        }
        
        // Check if item can start in this sprint (dependencies satisfied)
        if (!canWorkItemStartInSprint(item, sd.sprint, updatedWorkItems, updatedSprints)) {
          return false;
        }
        
        // Check if sprint has enough skill-specific capacity
        const capacities = sprintCapacities.get(sd.sprint.id);
        if (!capacities) return false;
        
        return canWorkItemBeAssignedToSprint(item, {
          frontend: capacities.frontend,
          backend: capacities.backend
        });
      });

      if (suitableSprints.length > 0) {
        // Choose the latest suitable sprint (closest to deadline)
        const targetSprint = suitableSprints.sort((a, b) => 
          b.sprint.endDate.getTime() - a.sprint.endDate.getTime()
        )[0];

        // Assign item to sprint
        const itemIndex = updatedWorkItems.findIndex(w => w.id === item.id);
        if (itemIndex >= 0) {
          updatedWorkItems[itemIndex] = {
            ...updatedWorkItems[itemIndex],
            assignedSprints: [targetSprint.sprint.id]
          };

          // Update sprint's work items
          const sprintIndex = updatedSprints.findIndex(s => s.id === targetSprint.sprint.id);
          if (sprintIndex >= 0 && !updatedSprints[sprintIndex].workItems.includes(item.id)) {
            updatedSprints[sprintIndex] = {
              ...updatedSprints[sprintIndex],
              workItems: [...updatedSprints[sprintIndex].workItems, item.id]
            };
          }

          // Reduce available capacity for each required skill
          const currentCapacities = sprintCapacities.get(targetSprint.sprint.id) || { total: 0, frontend: 0, backend: 0 };
          const updatedCapacities = { ...currentCapacities };
          
          item.requiredSkills.forEach(skill => {
            if (skill === 'frontend') {
              updatedCapacities.frontend = Math.max(0, updatedCapacities.frontend - item.estimateStoryPoints);
            } else if (skill === 'backend') {
              updatedCapacities.backend = Math.max(0, updatedCapacities.backend - item.estimateStoryPoints);
            }
          });
          
          updatedCapacities.total = Math.max(0, updatedCapacities.total - item.estimateStoryPoints);
          sprintCapacities.set(targetSprint.sprint.id, updatedCapacities);
        }
      }
    });

    onUpdateWorkItems(updatedWorkItems);
    onUpdateSprints(updatedSprints);
  };

  // Clear all assignments
  const clearAllAssignments = () => {
    const updatedWorkItems = data.workItems.map(item => ({
      ...item,
      assignedSprints: []
    }));
    
    const updatedSprints = data.sprints.map(sprint => ({
      ...sprint,
      workItems: []
    }));

    onUpdateWorkItems(updatedWorkItems);
    onUpdateSprints(updatedSprints);
  };

  // Assign item to sprint
  const assignItemToSprint = async (itemId: string, sprintId: string) => {
    // First, try to find the item in main work items array
    let workItem = data.workItems.find(item => item.id === itemId);
    
    // If not found, search within epic children
    if (!workItem) {
      for (const epic of data.workItems.filter(item => item.isEpic)) {
        const child = epic.children?.find(child => child.id === itemId);
        if (child) {
          workItem = child;
          break;
        }
      }
      
      // Also search in regular Epic objects
      if (!workItem) {
        for (const epic of data.epics) {
          const child = epic.children.find(child => child.id === itemId);
          if (child) {
            workItem = child;
            break;
          }
        }
      }
    }
    
    if (!workItem) {
      console.error(`Work item ${itemId} not found`);
      return;
    }
    
    const sprintInfo = sprintData.find(sd => sd.sprint.id === sprintId);
    
    // Check if assignment is valid (enough skill-specific capacity and dependencies satisfied)
    if (workItem && sprintInfo) {
      // Check dependencies first
      if (!canWorkItemStartInSprint(workItem, sprintInfo.sprint, data.workItems, data.sprints)) {
        const blockedBy = workItem.dependencies
          .map(depId => data.workItems.find(w => w.id === depId))
          .filter(dep => dep && dep.status !== 'Completed')
          .map(dep => dep!.title);
        
        alert(`Cannot assign item: Dependencies not satisfied. Blocked by: ${blockedBy.join(', ')}`);
        return;
      }
      
      // Check skill capacity
      const canAssign = canWorkItemBeAssignedToSprint(workItem, {
        frontend: sprintInfo.availableFrontendCapacity,
        backend: sprintInfo.availableBackendCapacity
      });
      
      if (!canAssign) {
        alert(`Cannot assign item: Insufficient ${workItem.requiredSkills.join(' and ')} capacity in this sprint.`);
        return;
      }
    }

    // Save sprint assignment to database (for regular work items, not epic children)
    const isRegularWorkItem = data.workItems.some(item => item.id === itemId);
    if (isRegularWorkItem) {
      try {
        console.log(`💾 Saving sprint assignment to database: ${itemId} → ${sprintId}`);
        await workItemsApi.assignToSprint(itemId, sprintId);
        console.log('✅ Sprint assignment saved to database');
      } catch (error) {
        console.error('❌ Failed to save sprint assignment to database:', error);
        alert('Failed to save sprint assignment. Please try again.');
        return;
      }
    } else {
      // Epic child - cannot be assigned to sprints directly
      // User must first convert the epic to work items via "Add to Work Items" button
      alert(`Cannot assign epic child "${workItem.title}" to sprint.\n\nEpic children must be converted to work items first.\n\nPlease:\n1. Go to the Epics tab\n2. Click "Add to Work Items" for the parent epic\n3. Then assign the work items to sprints`);
      return;
    }

    const updatedWorkItems = data.workItems.map(item => {
      // Handle regular work items
      if (item.id === itemId) {
        return {
          ...item,
          assignedSprints: item.assignedSprints.includes(sprintId) 
            ? item.assignedSprints 
            : [...item.assignedSprints, sprintId]
        };
      }
      
      // Handle epic work items - update children
      if (item.isEpic && item.children) {
        const childIndex = item.children.findIndex(child => child.id === itemId);
        if (childIndex !== -1) {
          const updatedChildren = [...item.children];
          updatedChildren[childIndex] = {
            ...updatedChildren[childIndex],
            assignedSprints: updatedChildren[childIndex].assignedSprints.includes(sprintId)
              ? updatedChildren[childIndex].assignedSprints
              : [...updatedChildren[childIndex].assignedSprints, sprintId]
          };
          
          return {
            ...item,
            children: updatedChildren
          };
        }
      }
      
      return item;
    });

    const updatedSprints = data.sprints.map(sprint => {
      if (sprint.id === sprintId && !sprint.workItems.includes(itemId)) {
        return {
          ...sprint,
          workItems: [...sprint.workItems, itemId]
        };
      }
      return sprint;
    });

    onUpdateWorkItems(updatedWorkItems);
    onUpdateSprints(updatedSprints);
  };

  // Remove item from sprint
  const removeItemFromSprint = async (itemId: string, sprintId: string) => {
    // Save sprint removal to database (for both regular work items and epic children that have been saved)
    try {
      console.log(`💾 Removing sprint assignment from database: ${itemId} ← ${sprintId}`);
      await workItemsApi.removeFromSprint(itemId, sprintId);
      console.log('✅ Sprint assignment removed from database');
    } catch (error) {
      console.error('❌ Failed to remove sprint assignment from database:', error);
      console.log('⚠️ Item might be an unsaved epic child, continuing with local state update');
    }

    const updatedWorkItems = data.workItems.map(item => {
      // Handle regular work items
      if (item.id === itemId) {
        return {
          ...item,
          assignedSprints: item.assignedSprints.filter(id => id !== sprintId)
        };
      }
      
      // Handle epic work items - update children
      if (item.isEpic && item.children) {
        const childIndex = item.children.findIndex(child => child.id === itemId);
        if (childIndex !== -1) {
          const updatedChildren = [...item.children];
          updatedChildren[childIndex] = {
            ...updatedChildren[childIndex],
            assignedSprints: updatedChildren[childIndex].assignedSprints.filter(id => id !== sprintId)
          };
          
          return {
            ...item,
            children: updatedChildren
          };
        }
      }
      
      return item;
    });

    const updatedSprints = data.sprints.map(sprint => {
      if (sprint.id === sprintId) {
        return {
          ...sprint,
          workItems: sprint.workItems.filter(id => id !== itemId)
        };
      }
      return sprint;
    });

    onUpdateWorkItems(updatedWorkItems);
    onUpdateSprints(updatedSprints);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, sprintId: string) => {
    e.preventDefault();
    if (draggedItem) {
      assignItemToSprint(draggedItem, sprintId);
      setDraggedItem(null);
    }
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization > 100) return 'text-red-600';
    if (utilization > 90) return 'text-orange-600';
    if (utilization < 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getCapacityBarColor = (utilization: number) => {
    if (utilization > 100) return 'bg-red-500';
    if (utilization > 90) return 'bg-orange-500';
    if (utilization < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5" />
            Sprint Planning
          </h2>
          <div className="flex gap-2">
            <button
              onClick={autoAssignItems}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
            >
              <Calculator className="h-4 w-4" />
              Auto-Assign Items
            </button>
            <button
              onClick={clearAllAssignments}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Clear All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="font-medium">Ready Items</div>
            <div className="text-xl font-bold text-blue-600">{readyItems.length}</div>
          </div>
          <div className="bg-yellow-50 p-3 rounded-lg">
            <div className="font-medium">Blocked Items</div>
            <div className="text-xl font-bold text-yellow-600">{blockedItems.length}</div>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <div className="font-medium">Total Unassigned Points</div>
            <div className="text-xl font-bold text-green-600">
              {unassignedItems.reduce((sum, item) => sum + item.estimateStoryPoints, 0)}
            </div>
          </div>
          <div className="bg-purple-50 p-3 rounded-lg">
            <div className="font-medium">Available Capacity</div>
            <div className="text-xl font-bold text-purple-600">
              {sprintData.reduce((sum, sd) => sum + sd.availableCapacity, 0).toFixed(1)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unassigned Items */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Unassigned Work Items</h3>
          
          {unassignedItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-300" />
              <p>All items are assigned!</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {/* Ready Items */}
              {readyItems.length > 0 && (
                <div>
                  <h4 className="text-md font-medium text-green-700 mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Ready to Assign ({readyItems.length})
                  </h4>
                  <div className="space-y-2">
                    {readyItems.map(item => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        className="p-3 border rounded-lg cursor-move hover:shadow-md transition-shadow bg-gray-50"
                      >
                        <div className="font-medium text-sm">{item.title}</div>
                        <div className="flex justify-between items-center mt-2 text-xs text-gray-600">
                          <div className="flex items-center gap-2">
                            <span>{item.estimateStoryPoints} pts</span>
                            <div className="flex gap-1">
                              {item.requiredSkills.map(skill => (
                                <span 
                                  key={skill}
                                  className={`px-1 py-0.5 rounded text-xs font-medium ${
                                    skill === 'frontend' 
                                      ? 'bg-purple-100 text-purple-800' 
                                      : 'bg-orange-100 text-orange-800'
                                  }`}
                                >
                                  {skill === 'frontend' ? 'FE' : 'BE'}
                                </span>
                              ))}
                            </div>
                          </div>
                          <span className={`font-medium ${
                            isBefore(item.requiredCompletionDate, new Date()) ? 'text-red-600' : ''
                          }`}>
                            Due: {format(item.requiredCompletionDate, 'MMM dd')}
                          </span>
                        </div>
                        {isBefore(item.requiredCompletionDate, new Date()) && (
                          <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Overdue
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Blocked Items */}
              {blockedItems.length > 0 && (
                <div>
                  <h4 className="text-md font-medium text-yellow-700 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Blocked by Dependencies ({blockedItems.length})
                  </h4>
                  <div className="space-y-2">
                    {blockedItems.map(item => {
                      const blockingDeps = item.dependencies
                        .map(depId => data.workItems.find(w => w.id === depId))
                        .filter(dep => dep && dep.status !== 'Completed');
                      
                      return (
                        <div
                          key={item.id}
                          className="p-3 border rounded-lg bg-yellow-50 border-yellow-200"
                        >
                          <div className="font-medium text-sm">{item.title}</div>
                          <div className="flex justify-between items-center mt-2 text-xs text-gray-600">
                            <div className="flex items-center gap-2">
                              <span>{item.estimateStoryPoints} pts</span>
                              <div className="flex gap-1">
                                {item.requiredSkills.map(skill => (
                                  <span 
                                    key={skill}
                                    className={`px-1 py-0.5 rounded text-xs font-medium ${
                                      skill === 'frontend' 
                                        ? 'bg-purple-100 text-purple-800' 
                                        : 'bg-orange-100 text-orange-800'
                                    }`}
                                  >
                                    {skill === 'frontend' ? 'FE' : 'BE'}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <span className={`font-medium ${
                              isBefore(item.requiredCompletionDate, new Date()) ? 'text-red-600' : ''
                            }`}>
                              Due: {format(item.requiredCompletionDate, 'MMM dd')}
                            </span>
                          </div>
                          <div className="text-xs text-yellow-700 mt-2">
                            <span className="font-medium">Blocked by:</span> {blockingDeps.map(dep => dep!.title).join(', ')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Epic Work Items */}
              {unassignedEpicWorkItems.length > 0 && (
                <div>
                  <h4 className="text-md font-medium text-indigo-700 mb-2 flex items-center gap-2">
                    <ChevronDown className="h-4 w-4" />
                    Epic Work Items ({unassignedEpicWorkItems.length})
                  </h4>
                  <div className="space-y-2">
                    {unassignedEpicWorkItems.map(epic => (
                      <div key={epic.id} className="border rounded-lg bg-indigo-50 border-indigo-200">
                        {/* Epic Header */}
                        <div 
                          className="p-3 cursor-pointer flex items-center gap-2"
                          onClick={() => toggleEpicExpansion(epic.id)}
                        >
                          {expandedEpics.has(epic.id) ? (
                            <ChevronDown className="h-4 w-4 text-indigo-600" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-indigo-600" />
                          )}
                          <div className="flex-1">
                            <div className="font-medium text-sm text-indigo-800">{epic.title}</div>
                            <div className="text-xs text-indigo-600">
                              {epic.children?.length || 0} children • {epic.jiraId}
                            </div>
                          </div>
                        </div>

                        {/* Epic Children (when expanded) */}
                        {expandedEpics.has(epic.id) && epic.children && (
                          <div className="px-6 pb-3 space-y-2">
                            {epic.children.map(child => {
                              const isCompleted = child.status === 'Completed';
                              const isAssigned = child.assignedSprints.length > 0;
                              const isDraggable = !isCompleted && !isAssigned;

                              return (
                                <div
                                  key={child.id}
                                  draggable={isDraggable}
                                  onDragStart={isDraggable ? (e) => handleDragStart(e, child.id) : undefined}
                                  className={`p-2 border rounded text-xs ${
                                    isCompleted 
                                      ? 'bg-green-50 border-green-200 text-green-700' 
                                      : isAssigned 
                                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                                        : 'bg-white border-gray-200 cursor-move hover:shadow-md transition-shadow'
                                  }`}
                                >
                                  <div className="font-medium">{child.title}</div>
                                  <div className="flex justify-between items-center mt-1">
                                    <div className="flex items-center gap-2">
                                      <span>{child.estimateStoryPoints} pts</span>
                                      <div className="flex gap-1">
                                        {child.requiredSkills.map(skill => (
                                          <span 
                                            key={skill}
                                            className={`px-1 py-0.5 rounded text-xs font-medium ${
                                              skill === 'frontend' 
                                                ? 'bg-purple-100 text-purple-800' 
                                                : 'bg-orange-100 text-orange-800'
                                            }`}
                                          >
                                            {skill === 'frontend' ? 'FE' : 'BE'}
                                          </span>
                                        ))}
                                      </div>
                                      {isCompleted && <span className="text-green-600 font-medium">✓ DONE</span>}
                                      {isAssigned && !isCompleted && <span className="text-blue-600 font-medium">📅 ASSIGNED</span>}
                                      {child.jiraStatus && (
                                        <span className="text-gray-600 text-xs bg-gray-100 px-2 py-1 rounded">
                                          {child.jiraStatus}
                                        </span>
                                      )}
                                    </div>
                                    <span className={`font-medium ${
                                      !isCompleted && isBefore(child.requiredCompletionDate, new Date()) ? 'text-red-600' : ''
                                    }`}>
                                      Due: {format(child.requiredCompletionDate, 'MMM dd')}
                                    </span>
                                  </div>
                                  {!isDraggable && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {isCompleted ? 'Cannot assign completed items' : 'Already assigned to a sprint'}
                                    </div>
                                  )}
                                  {!isCompleted && isBefore(child.requiredCompletionDate, new Date()) && (
                                    <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      Overdue
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Information about imported epics */}
              {data.epics.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="text-md font-medium text-yellow-800 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Imported Epics ({data.epics.length})
                  </h4>
                  <p className="text-sm text-yellow-700 mb-2">
                    You have {data.epics.length} imported epic(s) with {data.epics.reduce((total, epic) => total + epic.children.length, 0)} total children that are not yet converted to work items.
                  </p>
                  <p className="text-xs text-yellow-600">
                    To assign epic children to sprints, go to the <strong>Epics</strong> tab and click <strong>"Add to Work Items"</strong> for each epic you want to convert.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sprint Capacity Overview */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-semibold">Sprint Assignments</h3>
          
          {sprintData.map(({ 
            sprint, 
            assignedItems, 
            assignedPoints, 
            capacity, 
            utilization,
            skillCapacities,
            frontendPoints,
            backendPoints,
            frontendUtilization,
            backendUtilization
          }) => (
            <div
              key={sprint.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, sprint.id)}
              className="bg-white rounded-lg shadow p-4 border-2 border-dashed border-transparent hover:border-blue-300 transition-colors"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-semibold">{sprint.name}</h4>
                  <p className="text-sm text-gray-600">
                    {format(sprint.startDate, 'MMM dd')} - {format(sprint.endDate, 'MMM dd, yyyy')}
                  </p>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${getUtilizationColor(utilization)}`}>
                    {utilization.toFixed(0)}% utilized
                  </div>
                  <div className="text-sm text-gray-500">
                    {assignedPoints} / {capacity.toFixed(1)} pts
                  </div>
                </div>
              </div>

              {/* Skill-specific capacity */}
              <div className="mb-3 grid grid-cols-2 gap-4 text-xs">
                <div className="bg-purple-50 p-2 rounded">
                  <div className="font-medium text-purple-800">Frontend</div>
                  <div className={`${getUtilizationColor(frontendUtilization)}`}>
                    {frontendUtilization.toFixed(0)}% ({frontendPoints} / {skillCapacities.frontend.toFixed(1)} pts)
                  </div>
                </div>
                <div className="bg-orange-50 p-2 rounded">
                  <div className="font-medium text-orange-800">Backend</div>
                  <div className={`${getUtilizationColor(backendUtilization)}`}>
                    {backendUtilization.toFixed(0)}% ({backendPoints} / {skillCapacities.backend.toFixed(1)} pts)
                  </div>
                </div>
              </div>

              {/* Capacity bar */}
              <div className="mb-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${getCapacityBarColor(utilization)}`}
                    style={{ width: `${Math.min(utilization, 100)}%` }}
                  />
                </div>
                {utilization > 100 && (
                  <div className="text-xs text-red-600 mt-1">
                    Over capacity by {(assignedPoints - capacity).toFixed(1)} points
                  </div>
                )}
              </div>

              {/* Assigned items */}
              <div className="space-y-2">
                {assignedItems.length === 0 ? (
                  <div className="text-gray-500 text-sm italic py-2 text-center border-2 border-dashed border-gray-200 rounded">
                    Drop work items here or click Auto-Assign
                  </div>
                ) : (
                  assignedItems.map(item => (
                    <div key={item.id} className="flex justify-between items-center p-2 bg-blue-50 rounded text-sm">
                      <div>
                        <span className="font-medium">{item.title}</span>
                        <span className="ml-2 text-gray-600">({item.estimateStoryPoints} pts)</span>
                      </div>
                      <button
                        onClick={() => removeItemFromSprint(item.id, sprint.id)}
                        className="text-red-600 hover:bg-red-100 px-2 py-1 rounded text-xs"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Warnings */}
              {utilization > 100 && (
                <div className="mt-3 p-2 bg-red-50 text-red-800 rounded flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  Sprint is over-allocated. Consider moving items to later sprints.
                </div>
              )}
              
              {utilization < 70 && assignedItems.length > 0 && (
                <div className="mt-3 p-2 bg-yellow-50 text-yellow-800 rounded flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  Sprint has available capacity. Consider adding more items.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-800 mb-2">How to Plan Sprints</h3>
        <div className="text-sm text-blue-700 space-y-1">
          <div>• <strong>Drag & Drop:</strong> Drag work items from the left panel into sprints</div>
          <div>• <strong>Auto-Assign:</strong> Automatically assign items based on deadlines and capacity</div>
          <div>• <strong>Manual Assignment:</strong> Click items to assign them to specific sprints</div>
          <div>• <strong>Capacity Management:</strong> Keep utilization between 70-90% for optimal planning</div>
          <div>• <strong>Deadline Awareness:</strong> Overdue items are highlighted in red</div>
        </div>
      </div>
    </div>
  );
}; 