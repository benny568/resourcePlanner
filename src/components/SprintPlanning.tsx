import React, { useState, useMemo } from 'react';
import { WorkItem, Sprint, ResourcePlanningData } from '../types';
import { Calculator, Target, AlertTriangle, CheckCircle, ArrowRight, RotateCcw, ChevronDown, ChevronRight, Archive } from 'lucide-react';
import { format, isBefore, isAfter } from 'date-fns';
import { calculateSprintCapacity, calculateSprintSkillCapacities, canWorkItemBeAssignedToSprint, canWorkItemStartInSprint, getBlockedWorkItems, groupSprintsByQuarter } from '../utils/dateUtils';
import { workItemsApi, transformers, sprintsApi } from '../services/api';

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
  console.log('🎯 Sprint Planning loaded:', {
    workItems: data.workItems.length,
    sprints: data.sprints.length,
    epics: data.epics.length
  });
  
  const [selectedSprint, setSelectedSprint] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{x: number, y: number, itemId: string} | null>(null);
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [hideDropZones, setHideDropZones] = useState(false);
  const processingAssignmentRef = React.useRef(false);
  const processingRemovalRef = React.useRef(false);
  const dropHandledRef = React.useRef(false);

  // Debug function to track events (only essential events)
  const addDebugEvent = (event: string) => {
    // Only log critical success/error events to reduce console noise
    if (event.includes('SUCCESS!') || event.includes('❌')) {
      console.log(event);
    }
  };

  // Initialize drag and drop system  
  React.useEffect(() => {
    console.log('🎯 NEW Drag and Drop System Initialized');
  }, []);

  // Global pointer handlers for cleanup (simplified and less aggressive)
  React.useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      // Check if we should start dragging based on mouse movement
      if (dragStart && !draggedItem) {
        const distance = Math.sqrt(
          Math.pow(e.clientX - dragStart.x, 2) + 
          Math.pow(e.clientY - dragStart.y, 2)
        );
        
        console.log(`↔️ POINTER MOVE: Distance ${distance.toFixed(1)}px from start`);
        
        // Start drag when mouse moves more than 5 pixels
        if (distance > 5) {
          console.log(`🎯 DRAGGING: Starting drag for item "${dragStart.itemId}"`);
          setDraggedItem(dragStart.itemId);
          setHideDropZones(false);
          
          // Apply visual effects to the dragged item
          const draggedElement = document.querySelector(`[data-item-id="${dragStart.itemId}"]`) as HTMLElement;
          if (draggedElement) {
            draggedElement.style.opacity = '0.7';
            draggedElement.style.transform = 'scale(0.98)';
            draggedElement.style.pointerEvents = 'none';
          }
        }
      }
    };

    const handleGlobalPointerUp = () => {
      console.log(`🔼 POINTER UP: dragStart=${!!dragStart}, draggedItem=${!!draggedItem}`);
      
      // Always cleanup drag start state
      setDragStart(null);
      
      // Only cleanup if no specific handler already handled the drop
      if (draggedItem && !dropHandledRef.current) {
        console.log('🔄 Global pointer up - resetting drag state');
        
        // Remove blue border from ALL sprint containers immediately
        document.querySelectorAll('[data-sprint-id]').forEach((el) => {
          const htmlEl = el as HTMLElement;
          htmlEl.classList.remove('border-2', 'border-blue-300', 'bg-blue-50/30', 'shadow-md', 'cursor-copy', 'ring-1', 'ring-blue-200');
          htmlEl.classList.add('border', 'border-gray-200');
          htmlEl.style.minHeight = 'auto';
          htmlEl.style.cursor = 'default';
        });
        
        setDraggedItem(null);
        setHideDropZones(false);
        
        // Reset any stuck visual states
        document.querySelectorAll('[style*="opacity: 0.7"]').forEach((el: any) => {
          el.style.opacity = '1';
          el.style.transform = 'scale(1)';
          el.style.pointerEvents = 'auto';
        });
      }
      // Reset the flag for next drag operation
      dropHandledRef.current = false;
    };

    const handleWindowLeave = () => {
      // Only cancel drag when actually leaving the browser window
      if (draggedItem) {
        console.log('🔄 Window left: resetting drag state');
        
        // Remove blue border from ALL sprint containers immediately
        document.querySelectorAll('[data-sprint-id]').forEach((el) => {
          const htmlEl = el as HTMLElement;
          htmlEl.classList.remove('border-2', 'border-blue-300', 'bg-blue-50/30', 'shadow-md', 'cursor-copy', 'ring-1', 'ring-blue-200');
          htmlEl.classList.add('border', 'border-gray-200');
          htmlEl.style.minHeight = 'auto';
          htmlEl.style.cursor = 'default';
        });
        
        setDraggedItem(null);
        setDragStart(null);
        setHideDropZones(false);
        
        document.querySelectorAll('[style*="opacity: 0.7"]').forEach((el: any) => {
          el.style.opacity = '1';
          el.style.transform = 'scale(1)';
          el.style.pointerEvents = 'auto';
        });
      }
    };

    // Add all pointer event handlers
    document.addEventListener('pointermove', handleGlobalPointerMove);
    document.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('blur', handleWindowLeave); // Window loses focus
    
    return () => {
      document.removeEventListener('pointermove', handleGlobalPointerMove);
      document.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('blur', handleWindowLeave);
    };
  }, [dragStart, draggedItem]); // Add dependencies for drag state

  // Toggle epic expansion
  const toggleEpicExpansion = (epicId: string) => {
    const newExpanded = new Set(expandedEpics);
    if (newExpanded.has(epicId)) {
      newExpanded.delete(epicId);
      console.log(`🔽 COLLAPSING EPIC: ${epicId}`);
    } else {
      newExpanded.add(epicId);
      console.log(`🔼 EXPANDING EPIC: ${epicId}`);
    }
    setExpandedEpics(newExpanded);
    console.log(`📋 EXPANDED EPICS:`, Array.from(newExpanded));
  };

  // Get unassigned work items (exclude epic children - they'll be shown under parent epics)  
  const unassignedItems = data.workItems.filter(item => 
    item.assignedSprints.length === 0 && 
    item.status !== 'Completed' &&
    !item.isEpic && // Not an epic work item
    !item.epicId   // Not an epic child (they'll be grouped under parent epics)
  );
  
  // TEMP DEBUG: Check what's in unassigned items
  console.log('📋 Sample unassigned items:', unassignedItems.slice(0, 5).map(item => ({
    id: item.id,
    title: item.title.substring(0, 40),
    isEpic: item.isEpic,
    epicId: item.epicId,
    jiraId: item.jiraId,
    isChild: item.jiraId?.includes('-') && item.title.includes('Child')
  })));

  // Get blocked work items (have unfinished dependencies)
  const blockedItems = getBlockedWorkItems(unassignedItems, data.workItems);
  const readyItems = unassignedItems.filter(item => !blockedItems.includes(item));

  // Get all epic work items that are not completed (work items with isEpic: true)
  const unassignedEpicWorkItems = data.workItems.filter(item => 
    item.isEpic && 
    item.status !== 'Completed' &&
    (item.assignedSprints.length === 0 || // Epic itself is unassigned OR
     (item.children && item.children.some(child => child.assignedSprints.length === 0 && child.status !== 'Completed'))) // Has unassigned children
  );



  // Track available work items
  React.useEffect(() => {
    const totalDraggable = readyItems.length + unassignedEpicWorkItems.reduce((sum, epic) => sum + (epic.children?.filter(child => !child.assignedSprints.length).length || 0), 0);
    if (totalDraggable > 0) {
      console.log(`🎯 ${totalDraggable} work items available for assignment`);
    }
  }, [readyItems, unassignedEpicWorkItems]);

  // Get upcoming sprints (not in the past)
  const upcomingSprints = data.sprints.filter(sprint => 
    !isBefore(sprint.endDate, new Date())
  ).slice(0, 12); // Show next 12 sprints to better showcase quarterly grouping

  // Group sprints by quarter
  const quarterGroups = useMemo(() => {
    return groupSprintsByQuarter(upcomingSprints);
  }, [upcomingSprints]);

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
      
      // Combine all assigned items and deduplicate by ID
      const combinedItems = [...assignedItems, ...assignedEpicChildren];
      const allAssignedItems = combinedItems.filter((item, index, array) => 
        array.findIndex(i => i.id === item.id) === index
      );
      
      // Debug: Log if duplicates were found
      if (combinedItems.length > allAssignedItems.length) {
        console.log(`🔍 REMOVED ${combinedItems.length - allAssignedItems.length} duplicate(s) in sprint "${sprint.name}"`);
      }
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
    console.log(`🔍 ASSIGN CALLED: ${itemId} → ${sprintId}`);
    
    // Prevent duplicate assignments by checking if already processing
    if (processingAssignmentRef.current) {
      console.log('⚠️ Assignment already in progress, skipping');
      return;
    }
    processingAssignmentRef.current = true;

    try {
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
        alert(`Work item not found. Please refresh the page and try again.`);
      return;
    }

      // Check if already assigned to this sprint
      if (workItem.assignedSprints.includes(sprintId)) {
        console.log(`Item ${itemId} already assigned to sprint ${sprintId}`);
        alert(`"${workItem.title}" is already assigned to this sprint.`);
        return;
      }
      
                  // Determine work item skill based on title and description content (per workspace rules)
            let updatedWorkItem = { ...workItem };
            const title = workItem.title?.toLowerCase() || '';
            const description = workItem.description?.toLowerCase() || '';
            
            // Check for explicit skill indicators in title (more reliable)
            const titleHasBackend = title.includes('be:') || title.includes('backend');
            const titleHasFrontend = title.includes('fe:') || title.includes('frontend');
            
            // Check if title or description contains BE or FE indicators
            const hasBackendIndicator = title.includes('be') || description.includes('be');
            const hasFrontendIndicator = title.includes('fe') || description.includes('fe');
            
            // Apply automatic skill determination - prioritize title over description
            if (titleHasFrontend && !titleHasBackend) {
              // Title explicitly indicates frontend
              console.log(`🎯 Auto-detected Frontend skill from title: "${workItem.title}"`);
              updatedWorkItem = {
                ...updatedWorkItem,
                requiredSkills: ['frontend']
              };
            } else if (titleHasBackend && !titleHasFrontend) {
              // Title explicitly indicates backend
              console.log(`🎯 Auto-detected Backend skill from title: "${workItem.title}"`);
              updatedWorkItem = {
                ...updatedWorkItem,
                requiredSkills: ['backend']
              };
            } else if (hasBackendIndicator && !hasFrontendIndicator) {
              // Fall back to description analysis - backend only
              console.log(`🎯 Auto-detected Backend skill from description: "${workItem.title}" / "${workItem.description}"`);
              updatedWorkItem = {
                ...updatedWorkItem,
                requiredSkills: ['backend']
              };
            } else if (hasFrontendIndicator && !hasBackendIndicator) {
              // Fall back to description analysis - frontend only
              console.log(`🎯 Auto-detected Frontend skill from description: "${workItem.title}" / "${workItem.description}"`);
              updatedWorkItem = {
                ...updatedWorkItem,
                requiredSkills: ['frontend']
              };
            } else if (!titleHasFrontend && !titleHasBackend && !hasBackendIndicator && !hasFrontendIndicator && updatedWorkItem.requiredSkills.length > 1) {
        // No BE/FE indicators in title or description and currently has both skills → Ask user
        const userChoice = prompt(
          `Cannot auto-determine skill for "${workItem.title}".\n\n` +
          `Title: "${workItem.title}"\n` +
          `Description: "${workItem.description}"\n\n` +
          `Please specify the required skill:\n` +
          `Type "FE" for Frontend or "BE" for Backend:`
        );
        
        if (userChoice?.toLowerCase() === 'fe' || userChoice?.toLowerCase() === 'frontend') {
          console.log(`👤 User selected Frontend skill for: "${workItem.title}"`);
          updatedWorkItem = {
            ...updatedWorkItem,
            requiredSkills: ['frontend']
          };
        } else if (userChoice?.toLowerCase() === 'be' || userChoice?.toLowerCase() === 'backend') {
          console.log(`👤 User selected Backend skill for: "${workItem.title}"`);
          updatedWorkItem = {
            ...updatedWorkItem,
            requiredSkills: ['backend']
          };
        } else {
          // User cancelled or provided invalid input
          console.log(`❌ Invalid skill selection, keeping existing skills: ${workItem.requiredSkills.join(', ')}`);
          alert(`Invalid selection. Keeping existing skills: ${workItem.requiredSkills.join(', ')}`);
        }
      }
      // If both BE and FE indicators are present, or already has single skill, keep existing skills
    
    const sprintInfo = sprintData.find(sd => sd.sprint.id === sprintId);
    
    // Check if assignment is valid (enough skill-specific capacity and dependencies satisfied)
      if (updatedWorkItem && sprintInfo) {
      // Check dependencies first
        if (!canWorkItemStartInSprint(updatedWorkItem, sprintInfo.sprint, data.workItems, data.sprints)) {
          const blockedBy = updatedWorkItem.dependencies
          .map(depId => data.workItems.find(w => w.id === depId))
          .filter(dep => dep && dep.status !== 'Completed')
          .map(dep => dep!.title);
        
          const message = `Cannot assign "${updatedWorkItem.title}": Dependencies not satisfied.`;
          console.log(`❌ ${message} Blocked by: ${blockedBy.join(', ')}`);
          alert(`❌ ${message}\n\nBlocked by: ${blockedBy.join(', ')}`);
        return;
      }
      
        // Check skill capacity using the updated work item skills
        const canAssign = canWorkItemBeAssignedToSprint(updatedWorkItem, {
        frontend: sprintInfo.availableFrontendCapacity,
        backend: sprintInfo.availableBackendCapacity
      });
      
      if (!canAssign) {
          const message = `Cannot assign "${updatedWorkItem.title}": Insufficient ${updatedWorkItem.requiredSkills.join(' and ')} capacity in this sprint.`;
          console.log(`❌ ${message}`);
          alert(`❌ ${message}\n\nItem needs: ${updatedWorkItem.estimateStoryPoints} pts (${updatedWorkItem.requiredSkills.join(' + ')})\nAvailable: Frontend ${sprintInfo.availableFrontendCapacity.toFixed(1)} pts, Backend ${sprintInfo.availableBackendCapacity.toFixed(1)} pts`);
        return;
      }
    }

      // Save sprint assignment to database
      // Both regular work items and epic children (if they exist as work items) can be assigned
      const isWorkItem = data.workItems.some(item => item.id === itemId);
      const isEpicChild = data.workItems.some(epic => 
        epic.isEpic && epic.children?.some(child => child.id === itemId)
      );
      
      if (isWorkItem || isEpicChild) {
        try {
          // Save updated skills to database if they were modified
          if (updatedWorkItem.requiredSkills !== workItem.requiredSkills) {
            console.log(`💾 Saving updated skills to database: ${itemId} → ${updatedWorkItem.requiredSkills.join(', ')}`);
            const workItemData = transformers.workItemToApi(updatedWorkItem);
            await workItemsApi.update(itemId, workItemData);
            console.log('✅ Work item skills updated in database');
          }
          
        console.log(`💾 Saving sprint assignment to database: ${itemId} → ${sprintId}`);
        await workItemsApi.assignToSprint(itemId, sprintId);
        console.log('✅ Sprint assignment saved to database');
      } catch (error) {
          console.error('❌ Failed to save to database:', error);
          alert('❌ Failed to save assignment. Please try again.');
        return;
      }
    } else {
        // This is an imported epic child that hasn't been converted to a work item yet
        const message = `Cannot assign "${workItem.title}" to sprint. This item needs to be converted to a work item first.`;
        console.log(`❌ ${message}`);
        alert(`❌ ${message}\n\nPlease:\n1. Go to the Epics tab\n2. Click "Add to Work Items" for the parent epic\n3. Then assign the work items to sprints`);
        return;
    }

    const updatedWorkItems = data.workItems.map(item => {
      // Handle regular work items
      if (item.id === itemId) {
        return {
          ...item,
            requiredSkills: updatedWorkItem.requiredSkills, // Update skills based on description analysis
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
              requiredSkills: updatedWorkItem.requiredSkills, // Update skills based on description analysis
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
    } finally {
      // Always clear the processing flag
      setTimeout(() => {
        processingAssignmentRef.current = false;
      }, 100);
    }
  };

  // Remove item from sprint
  const removeItemFromSprint = async (itemId: string, sprintId: string) => {
    console.log(`🗑️ REMOVE CALLED: ${itemId} from ${sprintId}`);
    
    // Prevent duplicate removals
    if (processingRemovalRef.current) {
      console.log('⚠️ Removal already in progress, skipping');
      return;
    }
    processingRemovalRef.current = true;

    try {
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
    } finally {
      // Always clear the processing flag
      setTimeout(() => {
        processingRemovalRef.current = false;
      }, 100);
    }
  };

  // Archive a completed sprint
  const archiveSprint = async (sprintId: string) => {
    try {
      const sprint = data.sprints.find(s => s.id === sprintId);
      if (!sprint) {
        alert('Sprint not found');
        return;
      }

      // Confirm with user before archiving
      const confirmMessage = `Are you sure you want to archive "${sprint.name}"?\n\nThis will remove it from the sprint planning view but preserve all historical data.`;
      if (!confirm(confirmMessage)) {
        return;
      }

      console.log(`📦 Archiving sprint: ${sprintId} ("${sprint.name}")`);
      await sprintsApi.delete(sprintId);
      console.log('✅ Sprint archived successfully');

      // Remove the sprint from local state
      const updatedSprints = data.sprints.filter(s => s.id !== sprintId);
      onUpdateSprints(updatedSprints);

      // Note: Work items assigned to this sprint will remain in the system
      // but their sprint assignments will naturally be cleaned up by the UI
      
    } catch (error) {
      console.error('❌ Failed to archive sprint:', error);
      alert('❌ Failed to archive sprint. Please try again.');
    }
  };

  // Note: Using pointer events instead of HTML5 drag events for better control and to prevent conflicts

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
          

          

          
          {unassignedItems.length === 0 && unassignedEpicWorkItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-300" />
              <p>All items are assigned!</p>
            </div>
          ) : (
            <div className="space-y-4 min-h-96 overflow-visible">{/* TEMP: Removed overflow restriction for testing */}
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
                        data-item-id={item.id}
                        onPointerDown={(e) => {
                            // Only start potential drag on left mouse button
                            if (e.button !== 0) return;
                            
                            console.log(`🔽 POINTER DOWN: Starting potential drag for "${item.title}"`);
                            setDragStart({
                              x: e.clientX,
                              y: e.clientY,
                              itemId: item.id
                            });
                            // Don't prevent default to allow scrolling
                          }}
                          onClick={(e) => {
                            console.log(`🖱️ CLICKED on item: "${item.title}"`);
                          }}
                          onPointerUp={(e) => {
                            console.log(`🔼 ITEM POINTER UP: draggedItem=${draggedItem}, item.id=${item.id}`);
                            
                            // Always clear drag start on pointer up
                            setDragStart(null);
                            
                            if (draggedItem === item.id) {
                              // Check if we're over a sprint area using elementFromPoint
                              const elementUnderPointer = document.elementFromPoint(e.clientX, e.clientY);
                              if (elementUnderPointer) {
                                // Look for sprint container by traversing up the DOM
                                let sprintElement = elementUnderPointer;
                                let sprintId = null;
                                
                                while (sprintElement && !sprintId) {
                                  // Check for data-sprint-id attribute
                                  if (sprintElement instanceof HTMLElement && sprintElement.dataset.sprintId) {
                                    sprintId = sprintElement.dataset.sprintId;
                                    break;
                                  }
                                  
                                  // Check for sprint container characteristics
                                  const classList = Array.from(sprintElement.classList);
                                  if (classList.includes('border-dashed') && classList.includes('p-6')) {
                                    // Try to find sprint name in this container
                                    const sprintNameElement = sprintElement.querySelector('h4');
                                    if (sprintNameElement) {
                                      const sprintName = sprintNameElement.textContent;
                                      const matchingSprint = upcomingSprints.find(s => s.name === sprintName);
                                      if (matchingSprint) {
                                        sprintId = matchingSprint.id;
                                        break;
                                      }
                                    }
                                  }
                                  sprintElement = sprintElement.parentElement as HTMLElement;
                                }
                                
                                if (sprintId) {
                                  addDebugEvent(`🎯 SUCCESS! Assigned "${item.title}" to sprint`);
                                  
                                  // Stop event propagation to prevent sprint handler from also firing
                                  e.stopPropagation();
                                  e.preventDefault();
                                  
                                  // Mark drop as handled
                                  dropHandledRef.current = true;
                                  
                                  // Assign to sprint (global handler will clean up drag state)
                                  assignItemToSprint(draggedItem, sprintId);
                                  return; // Successfully handled
                                }
                              }
                              
                              // No sprint found - global handler will clean up drag state
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            return false;
                          }}
                                                  className="p-4 border border-amber-300 rounded-lg hover:shadow-md hover:border-amber-400 transition-all duration-200 bg-amber-50 select-none cursor-grab active:cursor-grabbing"
                                                      style={{ 
                            userSelect: 'none',
                            cursor: 'grab',
                            touchAction: 'pan-y', // Allow vertical scrolling
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                            WebkitTouchCallout: 'none',
                            WebkitTapHighlightColor: 'transparent',
                            pointerEvents: 'auto',
                            position: 'relative',
                            zIndex: 1,
                            transition: 'all 0.2s ease'
                          }}
                      >
                        <div className="font-medium text-sm">{item.jiraId ? `${item.jiraId} - ${item.title}` : item.title}</div>
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
                          className="p-4 border rounded-lg bg-amber-50 border-amber-200 hover:border-amber-300 hover:shadow-sm transition-all duration-200"
                        >
                          <div className="font-medium text-sm">{item.jiraId ? `${item.jiraId} - ${item.title}` : item.title}</div>
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

              {/* Epic Work Items - Display as top-level items */}
                    {unassignedEpicWorkItems.map(epic => (
                      <div key={epic.id} className="border rounded-lg bg-indigo-50 border-indigo-200">
                        {/* Epic Header */}
                        <div 
                          className="p-3 cursor-pointer flex items-center gap-2 hover:bg-indigo-100 transition-colors"
                          onClick={() => {
                            console.log(`🖱️ EPIC HEADER CLICKED: ${epic.id}`);
                            toggleEpicExpansion(epic.id);
                          }}
                        >
                          {expandedEpics.has(epic.id) ? (
                            <ChevronDown className="h-4 w-4 text-indigo-600" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-indigo-600" />
                          )}
                          <div className="flex-1">
                            <div className="font-medium text-sm text-indigo-800 flex items-center gap-2">
                              📋 {epic.jiraId ? `${epic.jiraId} - ${epic.title}` : epic.title}
                            </div>
                            <div className="text-xs text-indigo-600">
                              Epic • {epic.children?.length || 0} children • {epic.jiraId}
                            </div>
                          </div>
                        </div>

                        {/* Epic Children (when expanded) */}
                        {expandedEpics.has(epic.id) && epic.children && (
                          <div style={{
                            maxHeight: '300px',
                            width: '100%',
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            padding: '12px',
                            backgroundColor: '#f9fafb',
                            marginTop: '8px'
                          }}>
                            <div style={{ 
                              fontSize: '14px', 
                              fontWeight: '600', 
                              marginBottom: '12px',
                              color: '#374151',
                              borderBottom: '1px solid #e5e7eb',
                              paddingBottom: '8px'
                            }}>
                              Epic Children ({epic.children?.length || 0} items)
                            </div>
                            
                            {epic.children?.map((child, index) => {
                              // Apply skill detection for epic children
                              const title = child.title?.toLowerCase() || '';
                              const description = child.description?.toLowerCase() || '';
                              const hasBackendIndicator = title.includes('be') || description.includes('be');
                              const hasFrontendIndicator = title.includes('fe') || description.includes('fe');
                              
                              let detectedSkills = child.requiredSkills;
                              
                              // Check for explicit skill indicators in title (more reliable)
                              const titleHasBackend = title.includes('be:') || title.includes('backend');
                              const titleHasFrontend = title.includes('fe:') || title.includes('frontend');
                              
                              if (titleHasFrontend && !titleHasBackend) {
                                // Title explicitly indicates frontend
                                detectedSkills = ['frontend'];
                              } else if (titleHasBackend && !titleHasFrontend) {
                                // Title explicitly indicates backend
                                detectedSkills = ['backend'];
                              } else if (hasBackendIndicator && !hasFrontendIndicator) {
                                // Fall back to description analysis
                                detectedSkills = ['backend'];
                              } else if (hasFrontendIndicator && !hasBackendIndicator) {
                                // Fall back to description analysis
                                detectedSkills = ['frontend'];
                              }
                              
                              const isCompleted = child.status === 'Completed';
                              const isAssigned = child.assignedSprints.length > 0;
                              const isDraggable = !isAssigned && !isCompleted;

                              return (
                                <div
                                  key={child.id}
                                  data-item-id={child.id}
                                  onPointerDown={isDraggable ? (e) => {
                                    // Only start potential drag on left mouse button
                                    if (e.button !== 0) return;
                                    
                                    setDragStart({
                                      x: e.clientX,
                                      y: e.clientY,
                                      itemId: child.id
                                    });
                                    // Don't prevent default to allow scrolling
                                  } : undefined}
                                  onPointerUp={isDraggable ? (e) => {
                                    // Always clear drag start on pointer up
                                    setDragStart(null);
                                    
                                    if (draggedItem === child.id) {
                                      const elementUnderPointer = document.elementFromPoint(e.clientX, e.clientY);
                                      let sprintElement = elementUnderPointer;
                                      let sprintId = null;
                                      
                                      // Look for sprint container
                                      while (sprintElement && !sprintId) {
                                        if (sprintElement instanceof HTMLElement && sprintElement.dataset.sprintId) {
                                          sprintId = sprintElement.dataset.sprintId;
                                          break;
                                        }
                                        sprintElement = sprintElement.parentElement as HTMLElement;
                                      }
                                      
                                      if (sprintId) {
                                        console.log(`🎯 SUCCESS! Epic child "${child.title}" assigned to sprint`);
                                        e.stopPropagation();
                                        e.preventDefault();
                                        
                                        // Mark that this drop was handled by a specific handler
                                        dropHandledRef.current = true;
                                        
                                        assignItemToSprint(child.id, sprintId);
                                        return;
                                      }
                                    }
                                  } : undefined}
                                  style={{ 
                                    display: 'block',
                                    width: '100%',
                                    margin: '0 0 8px 0',
                                    padding: '12px',
                                    border: `1px solid ${isCompleted ? '#bbf7d0' : isAssigned ? '#bfdbfe' : isDraggable ? '#fed7aa' : '#e5e7eb'}`,
                                    borderRadius: '6px',
                                    backgroundColor: isCompleted ? '#f0fdf4' : isAssigned ? '#eff6ff' : isDraggable ? '#fffbeb' : '#f9fafb',
                                    color: isCompleted ? '#166534' : isAssigned ? '#1e40af' : '#374151',
                                    fontSize: '14px',
                                    lineHeight: '1.5',
                                    cursor: isDraggable ? 'grab' : 'default',
                                    userSelect: 'none',
                                    touchAction: 'pan-y', // Allow vertical scrolling
                                    boxSizing: 'border-box',
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  <div style={{ fontWeight: '500', marginBottom: '6px' }}>
                                    {child.jiraId ? `${child.jiraId} - ${child.title}` : child.title}
                                  </div>
                                  <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center',
                                    fontSize: '12px',
                                    color: '#6b7280'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span>{child.estimateStoryPoints} pts</span>
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        {detectedSkills.map(skill => (
                                          <span 
                                            key={skill}
                                            style={{
                                              padding: '2px 6px',
                                              borderRadius: '4px',
                                              fontSize: '11px',
                                              fontWeight: '500',
                                              backgroundColor: skill === 'frontend' ? '#f3e8ff' : '#fed7aa',
                                              color: skill === 'frontend' ? '#7c3aed' : '#ea580c'
                                            }}
                                          >
                                            {skill === 'frontend' ? 'FE' : 'BE'}
                                          </span>
                                        ))}
                                      </div>
                                      {isCompleted && <span style={{ color: '#059669', fontWeight: '500' }}>✓ DONE</span>}
                                      {isAssigned && !isCompleted && <span style={{ color: '#2563eb', fontWeight: '500' }}>📅 ASSIGNED</span>}
                                    </div>
                                    <span style={{ 
                                      fontWeight: '500',
                                      color: !isCompleted && isBefore(child.requiredCompletionDate, new Date()) ? '#dc2626' : '#6b7280'
                                    }}>
                                      Due: {format(child.requiredCompletionDate, 'MMM dd')}
                                    </span>
                                  </div>
                                  {!isDraggable && (
                                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                                      {isCompleted ? 'Cannot assign completed items' : 'Already assigned to a sprint'}
                                    </div>
                                  )}
                                  {!isCompleted && isBefore(child.requiredCompletionDate, new Date()) && (
                                    <div style={{ 
                                      fontSize: '11px', 
                                      color: '#dc2626', 
                                      marginTop: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}>
                                      <AlertTriangle style={{ height: '12px', width: '12px' }} />
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
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-lg font-semibold">Sprint Assignments</h3>
          
          {quarterGroups.map(({ quarter, sprints }) => (
            <div key={quarter} className="space-y-4">
              {/* Quarter Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px bg-gradient-to-r from-blue-300 to-transparent flex-1"></div>
                <h4 className="text-md font-semibold text-blue-700 bg-blue-50 px-4 py-2 rounded-full border border-blue-200">
                  {quarter}
                </h4>
                <div className="h-px bg-gradient-to-l from-blue-300 to-transparent flex-1"></div>
              </div>
              
              {/* Sprints in this quarter */}
              <div className="space-y-4 pl-4">
                {sprints.map(sprint => {
                  const sprintInfo = sprintData.find(sd => sd.sprint.id === sprint.id);
                  if (!sprintInfo) return null;
                  
                  const { 
                    assignedItems, 
                    assignedPoints, 
                    capacity, 
                    utilization,
                    skillCapacities,
                    frontendPoints,
                    backendPoints,
                    frontendUtilization,
                    backendUtilization
                  } = sprintInfo;
                  
                  return (
                    <div
                      key={sprint.id}
                      data-sprint-id={sprint.id}
                      onPointerUp={(e) => {
                        // Always clear drag start on pointer up
                        setDragStart(null);
                        
                        if (draggedItem) {
                          addDebugEvent(`🎯 SUCCESS! Dropped item in "${sprint.name}"`);
                          e.stopPropagation(); // Prevent global pointerup from running too early
                          
                          // Mark that this drop was handled by a specific handler
                          dropHandledRef.current = true;
                          
                          const itemToAssign = draggedItem;
                          
                          // Assign to sprint (global handler will clean up visual state)
                          assignItemToSprint(itemToAssign, sprint.id);
                        }
                      }}
                      className={`bg-white rounded-lg shadow p-6 transition-all duration-200 ${
                        (draggedItem && !hideDropZones)
                          ? 'border-2 border-blue-300 bg-blue-50/30 shadow-md cursor-copy ring-1 ring-blue-200' 
                          : 'border border-gray-200 hover:border-gray-300 hover:shadow-md'
                      }`}
                      style={{
                        minHeight: (draggedItem && !hideDropZones) ? '200px' : 'auto',
                        position: 'relative',
                        pointerEvents: 'auto',
                        zIndex: 10,
                        cursor: (draggedItem && !hideDropZones) ? 'copy' : 'default'
                      }}
                    >
                      {/* Minimal drop zone indicator when dragging */}
                      {(draggedItem && !hideDropZones) && (
                        <div 
                          className="absolute inset-0 flex items-center justify-center bg-blue-50 bg-opacity-20 rounded-lg z-10"
                          style={{ pointerEvents: 'none' }}
                        >
                          <div className="text-blue-600 font-normal text-sm text-center opacity-60">
                            Drop here
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{sprint.name}</h4>
                            {isBefore(sprint.endDate, new Date()) && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                Completed
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">
                            {format(sprint.startDate, 'MMM dd')} - {format(sprint.endDate, 'MMM dd, yyyy')}
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="text-right">
                            <div className={`font-semibold ${getUtilizationColor(utilization)}`}>
                              {utilization.toFixed(0)}% utilized
                            </div>
                            <div className="text-sm text-gray-500">
                              {assignedPoints} / {capacity.toFixed(1)} pts
                            </div>
                          </div>
                          {/* Archive button for completed sprints */}
                          {isBefore(sprint.endDate, new Date()) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                archiveSprint(sprint.id);
                              }}
                              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title={`Archive sprint "${sprint.name}"`}
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )}
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
                          <div 
                            className="text-gray-500 text-sm italic py-2 text-center border-2 border-dashed border-gray-200 rounded"
                            style={{ pointerEvents: 'none' }}
                          >
                            Drop work items here or click Auto-Assign
                          </div>
                        ) : (
                          assignedItems.map(item => (
                            <div key={item.id} className="flex justify-between items-center p-2 bg-blue-50 rounded text-sm">
                              <div>
                                <span className="font-medium">{item.jiraId ? `${item.jiraId} - ${item.title}` : item.title}</span>
                                <span className="ml-2 text-gray-600">({item.estimateStoryPoints} pts)</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  console.log(`🗑️ REMOVE CLICKED: ${item.id} from ${sprint.id}`);
                                  e.preventDefault();
                                  e.stopPropagation();
                                  removeItemFromSprint(item.id, sprint.id);
                                }}
                                onPointerDown={(e) => {
                                  // Prevent any pointer events from triggering drag
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onPointerUp={(e) => {
                                  // Prevent any pointer events from triggering drag
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                className="text-red-600 hover:bg-red-100 px-2 py-1 rounded text-xs"
                                style={{ pointerEvents: 'auto', zIndex: 1000 }}
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
                  );
                })}
              </div>
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