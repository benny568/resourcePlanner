import React, { useState, useMemo } from 'react';
import { WorkItem, Sprint, ResourcePlanningData } from '../types';
import { Calculator, Target, AlertTriangle, CheckCircle, ArrowRight, RotateCcw, ChevronDown, ChevronRight, Archive, Save, X, ExternalLink } from 'lucide-react';
import { format, isBefore, isAfter } from 'date-fns';
import { calculateSprintCapacity, calculateSprintSkillCapacities, canWorkItemBeAssignedToSprint, canWorkItemStartInSprint, getBlockedWorkItems, groupSprintsByQuarter } from '../utils/dateUtils';
import { workItemsApi, transformers, sprintsApi } from '../services/api';
import { detectSkillsFromContent } from '../utils/skillDetection';

interface SprintPlanningProps {
  data: ResourcePlanningData;
  onUpdateWorkItems: (workItems: WorkItem[]) => void;
  onUpdateSprints: (sprints: Sprint[], useBatchOperation?: boolean, isRegeneration?: boolean, skipBackendSync?: boolean) => void;
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
  
  // Auto-assign preview state
  const [autoAssignPreview, setAutoAssignPreview] = useState<{
    workItems: WorkItem[];
    sprints: Sprint[];
    isPreviewActive: boolean;
    possibleEndDate?: Date | null;
    timestamp?: number;
  } | null>(null);
  
  // DEBUG: Track autoAssignPreview state changes
  React.useEffect(() => {
    console.log('🔄 autoAssignPreview STATE CHANGED:', {
      isActive: autoAssignPreview?.isPreviewActive,
      timestamp: autoAssignPreview?.timestamp,
      sprintsCount: autoAssignPreview?.sprints?.length,
      workItemsCount: autoAssignPreview?.workItems?.length
    });
  }, [autoAssignPreview]);
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

  // Use preview data if available, otherwise use actual data
  // CRITICAL: Once preview is active, NEVER switch back to data.* until preview is cleared
  const currentWorkItems = autoAssignPreview?.isPreviewActive ? autoAssignPreview.workItems : data.workItems;
  const currentSprints = autoAssignPreview?.isPreviewActive ? autoAssignPreview.sprints : data.sprints;
  
  // DEBUG: Ensure data source is stable in preview mode
  React.useEffect(() => {
    if (autoAssignPreview?.isPreviewActive) {
      console.log('🔒 PREVIEW MODE LOCKED - Using preview data, ignoring props updates');
      console.log('  - Preview sprints length:', autoAssignPreview.sprints.length);
      console.log('  - Preview sprints with assignments:', autoAssignPreview.sprints.filter(s => s.workItems.length > 0).length);
    }
  }, [autoAssignPreview?.isPreviewActive, data.workItems.length, data.sprints.length]);
  
  // DEBUG: Log data source and key metrics
  React.useEffect(() => {
    console.log('🔍 DATA SOURCE UPDATE:');
    console.log('  - Preview active:', autoAssignPreview?.isPreviewActive);
    console.log('  - currentSprints length:', currentSprints.length);
    console.log('  - First 3 sprints workItems:', currentSprints.slice(0, 3).map(s => ({ 
      id: s.id, 
      name: s.name, 
      workItemsCount: s.workItems.length,
      workItemsArray: s.workItems,
      clearTimestamp: (s as any)._clearTimestamp
    })));
    
    // Log total assigned items across all sprints
    const totalAssignedItems = currentSprints.reduce((sum, s) => sum + s.workItems.length, 0);
    console.log('  - Total assigned items across all sprints:', totalAssignedItems);
  }, [autoAssignPreview?.isPreviewActive, currentSprints]);
  


  // Get unassigned work items (exclude epic children - they'll be shown under parent epics)  
  const unassignedItems = currentWorkItems.filter(item => 
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
  const blockedItems = getBlockedWorkItems(unassignedItems, currentWorkItems);
  const readyItems = unassignedItems.filter(item => !blockedItems.includes(item));

  // Get all epic work items that are not completed (work items with isEpic: true)
  const unassignedEpicWorkItems = currentWorkItems.filter(item => 
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
  const upcomingSprints = currentSprints.filter(sprint => 
    !isBefore(sprint.endDate, new Date())
  ).slice(0, 12); // Show next 12 sprints to better showcase quarterly grouping

  // Group sprints by quarter
  const quarterGroups = useMemo(() => {
    // DEBUG: Check for duplicate sprints before grouping
    const sprintIds = upcomingSprints.map(s => s.id);
    const uniqueSprintIds = [...new Set(sprintIds)];
    if (sprintIds.length !== uniqueSprintIds.length) {
      console.error('🚨 DUPLICATE SPRINTS DETECTED!');
      console.error('  - Total sprints:', sprintIds.length);
      console.error('  - Unique sprint IDs:', uniqueSprintIds.length);
      console.error('  - Duplicate IDs:', sprintIds.filter((id, index) => sprintIds.indexOf(id) !== index));
      console.error('  - Full sprint list:', upcomingSprints.map(s => ({ id: s.id, name: s.name })));
    }
    
    // DEDUPLICATION: Remove duplicate sprints by name (keep the first occurrence)
    const sprintsByName = new Map();
    const deduplicatedSprints = upcomingSprints.filter(sprint => {
      if (sprintsByName.has(sprint.name)) {
        console.warn(`🗑️ Removing duplicate sprint: "${sprint.name}" (ID: ${sprint.id})`);
        return false; // Skip this duplicate
      } else {
        sprintsByName.set(sprint.name, sprint);
        return true; // Keep this sprint
      }
    });
    
    if (deduplicatedSprints.length !== upcomingSprints.length) {
      console.log(`✅ Deduplication complete: ${upcomingSprints.length} → ${deduplicatedSprints.length} sprints`);
    }
    
    return groupSprintsByQuarter(deduplicatedSprints);
  }, [upcomingSprints]);

  // Calculate sprint data with capacity and assignments
  const sprintData = useMemo(() => {
    // Get deduplicated sprints from quarterGroups
    const deduplicatedSprints = quarterGroups.flatMap(qg => qg.sprints);
    
    // CRITICAL: Don't run expensive calculations in preview mode with cleared data
    if (autoAssignPreview?.isPreviewActive) {
      console.log('🔒 PREVIEW MODE: Skipping expensive sprint calculations');
      return deduplicatedSprints.map(sprint => {
        const assignedItems = currentWorkItems.filter(item => 
          item.assignedSprints.includes(sprint.id)
        );
        // Calculate basic metrics for preview mode (no expensive calculations)
        const totalPoints = assignedItems.reduce((sum, item) => sum + (item.estimateStoryPoints || 0), 0);
        const frontendPoints = assignedItems.filter(item => 
          (item.description && item.description.toLowerCase().includes('fe')) || 
          (!item.description?.toLowerCase().includes('be') && Math.random() > 0.5) // Default assumption
        ).reduce((sum, item) => sum + (item.estimateStoryPoints || 0), 0);
        const backendPoints = totalPoints - frontendPoints;
        
        return {
          sprint,
          assignedItems,
          // Core properties expected by JSX
          assignedPoints: totalPoints,  // JSX expects assignedPoints, not totalPoints
          capacity: 67,                 // JSX expects capacity, not totalCapacity
          utilization: totalPoints > 0 ? (totalPoints / 67) * 100 : 0,
          availableCapacity: Math.max(0, 67 - totalPoints),
          
          // Skill-specific properties expected by JSX
          frontendPoints,               // JSX expects frontendPoints
          backendPoints,                // JSX expects backendPoints  
          frontendUtilization: frontendPoints > 0 ? (frontendPoints / 40) * 100 : 0,
          backendUtilization: backendPoints > 0 ? (backendPoints / 27) * 100 : 0,
          availableFrontendCapacity: Math.max(0, 40 - frontendPoints),
          availableBackendCapacity: Math.max(0, 27 - backendPoints),
          
          // SkillCapacities object expected by JSX
          skillCapacities: {
            frontend: 40,
            backend: 27,
            total: 67
          },
          
          // Additional compatibility properties  
          totalPoints,
          frontendCapacity: 40,
          backendCapacity: 27,
          frontendPointsAssigned: frontendPoints,
          backendPointsAssigned: backendPoints,
          frontendPercentage: frontendPoints > 0 ? (frontendPoints / 40) * 100 : 0,
          backendPercentage: backendPoints > 0 ? (backendPoints / 27) * 100 : 0,
          totalCapacity: 67,
          frontendAvailable: Math.max(0, 40 - frontendPoints),
          backendAvailable: Math.max(0, 27 - backendPoints),
          overallCapacity: 67,
          assignedPercentage: totalPoints > 0 ? (totalPoints / 67) * 100 : 0,
          capacityUtilization: totalPoints > 0 ? (totalPoints / 67) * 100 : 0
        };
      });
    }
    
    return deduplicatedSprints.map(sprint => {
      // Get assigned top-level work items
      const assignedItems = currentWorkItems.filter(item => 
        item.assignedSprints.includes(sprint.id)
      );
      

      
      // Get assigned epic children
      const assignedEpicChildren: WorkItem[] = [];
      currentWorkItems.filter(item => item.isEpic && item.children).forEach(epic => {
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
  }, [quarterGroups, currentWorkItems, data.teamMembers, data.publicHolidays, autoAssignPreview?.timestamp]);

  // Enhanced Auto-Assign Items with 70% capacity targeting and preview
  const autoAssignItems = () => {
    const updatedWorkItems = [...data.workItems];
    let updatedSprints = [...data.sprints];
    
    // Get all items that need assignment (including epic children)
    const allUnassignedItems = [];
    
    // Add individual unassigned items
    allUnassignedItems.push(...readyItems);
    
    // Add unassigned epic children from unassigned epic work items
    unassignedEpicWorkItems.forEach(epic => {
      if (epic.children) {
        const unassignedChildren = epic.children.filter(child => 
          child.assignedSprints.length === 0 && child.status !== 'Completed'
        ).map(child => {
          const inheritedChild = {
            ...child,
            // Ensure epic children inherit parent epic's priority and have proper epicId
            epicId: epic.id,
            parentEpicPriority: epic.priority || 'Medium',
            // Force priority inheritance for debugging
            _debugParentEpic: epic.title,
            _debugParentPriority: epic.priority,
            _debugChildOriginalPriority: child.priority
          };
          console.log(`🔍 Epic child inheritance: "${child.title}" from "${epic.title}" (${epic.priority}) → ${inheritedChild.parentEpicPriority}`);
          return inheritedChild;
        });
        allUnassignedItems.push(...unassignedChildren);
      }
    });

    // Clear existing assignments for items we're about to auto-assign
    allUnassignedItems.forEach(item => {
      const itemIndex = updatedWorkItems.findIndex(w => w.id === item.id);
      if (itemIndex >= 0) {
        updatedWorkItems[itemIndex] = {
          ...updatedWorkItems[itemIndex],
          assignedSprints: []
        };
      }
    });

    // Priority order for sorting
    const priorityOrder: { [key: string]: number } = {
      'Critical': 1,
      'High': 2,
      'Medium': 3,
      'Low': 4
    };

    // Debug: Show what items we have before sorting
    console.log(`🔍 PRE-SORT DEBUG: ${allUnassignedItems.length} total items before sorting:`);
    allUnassignedItems.forEach((item, idx) => {
      console.log(`  [${idx}] ${item.title.substring(0, 40)} - isEpic: ${item.isEpic}, epicId: ${item.epicId}, parentEpicPriority: ${(item as any).parentEpicPriority}`);
    });

    // Sort items by epic priority first, then by deadline
    const itemsToAssign = [...allUnassignedItems].sort((a, b) => {
      // Get epic priority for each item (either its own priority if it's an epic, or its parent epic's priority)
      const getItemPriority = (item: WorkItem) => {
        if (item.isEpic) {
          return item.priority || 'Medium';
        } else if (item.epicId) {
          // Use directly inherited priority if available (for epic children)
          if ((item as any).parentEpicPriority) {
            return (item as any).parentEpicPriority;
          }
          // Find parent epic's priority from work items
          const parentEpic = data.workItems.find(wi => wi.id === item.epicId && wi.isEpic);
          return parentEpic?.priority || 'Medium';
        }
        return 'Medium'; // Default for non-epic items
      };

      const priorityA = getItemPriority(a);
      const priorityB = getItemPriority(b);
      
      // First sort by priority
      const priorityDiff = priorityOrder[priorityA] - priorityOrder[priorityB];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      
      // Then sort by deadline (earliest first)
      const dateA = a.requiredCompletionDate instanceof Date 
        ? a.requiredCompletionDate 
        : new Date(a.requiredCompletionDate);
      const dateB = b.requiredCompletionDate instanceof Date 
        ? b.requiredCompletionDate 
        : new Date(b.requiredCompletionDate);
      return dateA.getTime() - dateB.getTime();
    });

    // Find first available sprint (sprint with no assignments or first empty sprint)
    let currentSprintIndex = 0;
    const existingSprints = sprintData.length > 0 ? sprintData : [];
    
    // If there are existing sprints with assignments, find the first free one
    if (existingSprints.length > 0) {
      currentSprintIndex = existingSprints.findIndex(sd => sd.assignedPoints === 0);
      if (currentSprintIndex === -1) {
        currentSprintIndex = existingSprints.length; // Start after last existing sprint
      }
    }

    // Track sprint utilizations for 70% capacity targeting
    const sprintUtilizations = new Map();
    let lastAssignedSprintEndDate: Date | null = null;

    console.log(`🎯 Auto-assign starting with ${itemsToAssign.length} items to assign`);
    console.log(`📊 Available sprints: ${existingSprints.length}, starting at index: ${currentSprintIndex}`);
    console.log(`🔍 Input to sorting - readyItems: ${readyItems.length}, epic children from ${unassignedEpicWorkItems.length} epics`);
    console.log(`🎯 Items sorted by priority and deadline:`, itemsToAssign.map(item => {
      const getItemPriority = (item: WorkItem) => {
        if (item.isEpic) {
          return item.priority || 'Medium';
        } else if (item.epicId) {
          // Use directly inherited priority if available (for epic children)
          if ((item as any).parentEpicPriority) {
            return (item as any).parentEpicPriority;
          }
          // Find parent epic's priority from work items
          const parentEpic = data.workItems.find(wi => wi.id === item.epicId && wi.isEpic);
          return parentEpic?.priority || 'Medium';
        }
        return 'Medium'; // Default for non-epic items
      };
      
      return {
        title: item.title.substring(0, 30),
        priority: getItemPriority(item),
        priorityNumber: priorityOrder[getItemPriority(item)],
        deadline: item.requiredCompletionDate,
        isEpic: item.isEpic,
        epicId: item.epicId,
        hasParentEpic: !!item.epicId,
        parentEpicFound: item.epicId ? !!data.workItems.find(wi => wi.id === item.epicId && wi.isEpic) : false,
        hasInheritedPriority: !!(item as any).parentEpicPriority,
        inheritedPriority: (item as any).parentEpicPriority,
        prioritySource: item.isEpic ? 'self' : ((item as any).parentEpicPriority ? 'inherited' : (item.epicId ? 'lookup' : 'default'))
      };
    }));
    
    itemsToAssign.forEach((item, idx) => {
      const itemPriority = item.isEpic ? (item.priority || 'Medium') : 
                          (item.epicId ? ((item as any).parentEpicPriority || 'Medium') : 'Medium');
      
      console.log(`\n🚀 [${idx + 1}/${itemsToAssign.length}] Processing: ${item.title.substring(0, 40)}...`);
      console.log(`   📋 Points: ${item.estimateStoryPoints}, Skills: [${item.requiredSkills.join(', ')}], Priority: ${itemPriority}`);
      
      let assigned = false;
      
      // For higher priority items (Critical, High), allow more aggressive filling of earlier sprints
      // For lower priority items (Medium, Low), be more conservative and prefer later sprints
      const priorityBonus = priorityOrder[itemPriority] <= 2 ? 0.1 : 0; // Critical/High get 10% bonus capacity
      const targetUtilization = priorityOrder[itemPriority] <= 2 ? 0.8 : 0.7; // Critical/High can fill to 80%
      
      console.log(`   🎯 Priority-based targeting: ${targetUtilization * 100}% utilization limit for ${itemPriority} priority`);
      
      // Priority-aware sprint assignment: ensure higher priority items get earlier sprint access
      const getPriorityAwareStartSprint = () => {
        const itemPriorityNum = priorityOrder[itemPriority];
        
        // For Critical/High priority: can access any sprint
        if (itemPriorityNum <= 2) return currentSprintIndex;
        
        // For Medium/Low priority: find first sprint without higher priority items
        for (let sprintIdx = currentSprintIndex; sprintIdx < existingSprints.length; sprintIdx++) {
          const sprintData = existingSprints[sprintIdx];
          const sprint = sprintData.sprint;
          
          // Check if sprint has any work items and if any have higher priority
          const hasHigherPriorityItems = sprint.workItems && sprint.workItems.length > 0 && 
            sprint.workItems.some(workItem => {
              const workItemPriority = workItem.isEpic ? (workItem.priority || 'Medium') : 
                                     (workItem.epicId ? ((workItem as any).parentEpicPriority || 'Medium') : 'Medium');
              return priorityOrder[workItemPriority] < itemPriorityNum;
            });
          
          if (!hasHigherPriorityItems) {
            if (sprintIdx > currentSprintIndex) {
              console.log(`   🚫 Priority blocking: ${itemPriority} item redirected from sprint ${currentSprintIndex + 1} to sprint ${sprintIdx + 1}`);
            }
            return sprintIdx;
          }
        }
        
        return currentSprintIndex; // Fallback
      };
      
      const startSprintIndex = getPriorityAwareStartSprint();
      
      // Try to assign to existing sprints first (aiming for priority-based capacity)
      for (let i = startSprintIndex; i < existingSprints.length && !assigned; i++) {
        const sprintData = existingSprints[i];
        const sprint = sprintData.sprint;
        
        console.log(`   🔍 Checking sprint ${i + 1}: ${sprint.name}`);
        
        // Check if item can be assigned to this sprint
        if (!canWorkItemStartInSprint(item, sprint, updatedWorkItems, updatedSprints)) {
          console.log(`   ❌ Failed dependency check`);
          continue;
        }
        
        // Check deadline constraint - sprint must end before or on the item deadline
        const itemDeadline = item.requiredCompletionDate instanceof Date 
          ? item.requiredCompletionDate 
          : new Date(item.requiredCompletionDate);
        if (isAfter(sprint.endDate, itemDeadline)) {
          // Sprint ends after item deadline - this sprint is too late
          console.log(`   ❌ Failed deadline check: sprint ends ${sprint.endDate} vs deadline ${itemDeadline}`);
          continue;
        }
        
        // Calculate current utilization
        const currentUtilization = sprintUtilizations.get(sprint.id) || {
          totalCapacity: sprintData.capacity,
          frontendCapacity: sprintData.skillCapacities.frontend,
          backendCapacity: sprintData.skillCapacities.backend,
          assignedTotal: sprintData.assignedPoints,
          assignedFrontend: sprintData.frontendPoints,
          assignedBackend: sprintData.backendPoints
        };
        
        console.log(`   📊 Current utilization:`, {
          totalCapacity: currentUtilization.totalCapacity,
          frontendCapacity: currentUtilization.frontendCapacity,
          backendCapacity: currentUtilization.backendCapacity,
          assignedTotal: currentUtilization.assignedTotal,
          assignedFrontend: currentUtilization.assignedFrontend,
          assignedBackend: currentUtilization.assignedBackend
        });
        
        // Check if adding this item would exceed priority-based capacity in any skill
        const skillCapacityCheck = item.requiredSkills.every(skill => {
          if (skill === 'frontend') {
            const newFrontendUtil = (currentUtilization.assignedFrontend + item.estimateStoryPoints) / currentUtilization.frontendCapacity;
            console.log(`   🎨 Frontend check: ${currentUtilization.assignedFrontend} + ${item.estimateStoryPoints} = ${currentUtilization.assignedFrontend + item.estimateStoryPoints} / ${currentUtilization.frontendCapacity} = ${newFrontendUtil * 100}% (target: ${targetUtilization * 100}%)`);
            return newFrontendUtil <= targetUtilization;
          } else if (skill === 'backend') {
            const newBackendUtil = (currentUtilization.assignedBackend + item.estimateStoryPoints) / currentUtilization.backendCapacity;
            console.log(`   ⚙️ Backend check: ${currentUtilization.assignedBackend} + ${item.estimateStoryPoints} = ${currentUtilization.assignedBackend + item.estimateStoryPoints} / ${currentUtilization.backendCapacity} = ${newBackendUtil * 100}% (target: ${targetUtilization * 100}%)`);
            return newBackendUtil <= targetUtilization;
          }
          return true;
        });
        
        const newTotalUtil = (currentUtilization.assignedTotal + item.estimateStoryPoints) / currentUtilization.totalCapacity;
        console.log(`   📈 Total utilization check: ${newTotalUtil * 100}% (target: ${targetUtilization * 100}%)`);
        
        if (skillCapacityCheck && newTotalUtil <= targetUtilization) {
          console.log(`   ✅ ASSIGNED to ${sprint.name}!`);
          
          // Assign item to this sprint
          const itemIndex = updatedWorkItems.findIndex(w => w.id === item.id);
          if (itemIndex >= 0) {
            updatedWorkItems[itemIndex] = {
              ...updatedWorkItems[itemIndex],
              assignedSprints: [sprint.id]
            };

            // Update sprint's work items
            const sprintIndex = updatedSprints.findIndex(s => s.id === sprint.id);
            if (sprintIndex >= 0 && !updatedSprints[sprintIndex].workItems.includes(item.id)) {
              updatedSprints[sprintIndex] = {
                ...updatedSprints[sprintIndex],
                workItems: [...updatedSprints[sprintIndex].workItems, item.id]
              };
            }
            
            // Update utilization tracking
            const updatedUtil = { ...currentUtilization };
            updatedUtil.assignedTotal += item.estimateStoryPoints;
            
            item.requiredSkills.forEach(skill => {
              if (skill === 'frontend') {
                updatedUtil.assignedFrontend += item.estimateStoryPoints;
              } else if (skill === 'backend') {
                updatedUtil.assignedBackend += item.estimateStoryPoints;
              }
            });
            
            sprintUtilizations.set(sprint.id, updatedUtil);
            assigned = true;
            lastAssignedSprintEndDate = sprint.endDate;
          }
        } else {
          console.log(`   ❌ Failed capacity check: skills=${!skillCapacityCheck}, total=${newTotalUtil > targetUtilization}`);
        }
      }
      
      if (!assigned) {
        console.log(`   ⚠️ Item was NOT assigned to any existing sprint`);
      }
      
      // If not assigned to existing sprints, create new sprint if needed
      if (!assigned) {
        // TODO: Implement new sprint creation based on sprint configuration
        console.log(`⚠️ Item ${item.title} could not be assigned - may need new sprint creation`);
      }
    });

    // Calculate possible end date based on the last sprint with assigned work items
    let possibleEndDate: Date | null = null;
    
    // Find the last sprint that has any assigned work items after auto-assignment
    for (let i = updatedSprints.length - 1; i >= 0; i--) {
      const sprint = updatedSprints[i];
      const hasAssignedItems = sprint.workItems && sprint.workItems.length > 0;
      if (hasAssignedItems) {
        possibleEndDate = sprint.endDate;
        console.log(`📅 Projected finish date based on last sprint with assignments: ${sprint.name} (${format(sprint.endDate, 'MMM dd, yyyy')})`);
        break;
      }
    }
    
    // Fallback to today if no sprints have assignments
    if (!possibleEndDate) {
      possibleEndDate = new Date();
      console.log(`📅 No assignments found - projected finish date defaults to today`);
    }

    // Set preview state instead of immediately saving
    setAutoAssignPreview({
      workItems: updatedWorkItems,
      sprints: updatedSprints,
      isPreviewActive: true,
      possibleEndDate
    });
  };

  // Save auto-assign preview to database
  const saveAutoAssignPreview = async () => {
    if (!autoAssignPreview) return;
    
    try {
      console.log('💾 Saving auto-assign results to database...');
      
      // Find all work items that have assignment changes in the preview
      const assignmentPromises: Promise<any>[] = [];
      
      autoAssignPreview.workItems.forEach(previewItem => {
        const originalItem = data.workItems.find(item => item.id === previewItem.id);
        if (originalItem) {
          // Find new sprint assignments (sprints that exist in preview but not in original)
          const newSprintIds = previewItem.assignedSprints.filter(sprintId => 
            !originalItem.assignedSprints.includes(sprintId)
          );
          
          // Find removed sprint assignments (sprints that exist in original but not in preview)
          const removedSprintIds = originalItem.assignedSprints.filter(sprintId => 
            !previewItem.assignedSprints.includes(sprintId)
          );
          
          // Save each new assignment to database
          newSprintIds.forEach(sprintId => {
            console.log(`💾 Adding assignment: ${previewItem.title.substring(0, 30)}... → Sprint ${sprintId}`);
            assignmentPromises.push(
              workItemsApi.assignToSprint(previewItem.id, sprintId)
                .then(() => console.log(`✅ Added: ${previewItem.id} → ${sprintId}`))
                .catch(error => {
                  console.error(`❌ Failed to add assignment ${previewItem.id} → ${sprintId}:`, error);
                  throw error;
                })
            );
          });
          
          // Remove each assignment from database
          removedSprintIds.forEach(sprintId => {
            console.log(`🗑️ Removing assignment: ${previewItem.title.substring(0, 30)}... ← Sprint ${sprintId}`);
            assignmentPromises.push(
              workItemsApi.removeFromSprint(previewItem.id, sprintId)
                .then(() => console.log(`✅ Removed: ${previewItem.id} ← ${sprintId}`))
                .catch(error => {
                  console.error(`❌ Failed to remove assignment ${previewItem.id} ← ${sprintId}:`, error);
                  throw error;
                })
            );
          });
        }
      });
      
      // Wait for all database saves to complete
      await Promise.all(assignmentPromises);
      console.log(`✅ All ${assignmentPromises.length} assignments saved to database`);
      
      // Update local state after successful database saves
      onUpdateWorkItems(autoAssignPreview.workItems);
      
      // Check if this is a Clear All operation (all sprints have empty workItems)
      const isClearAllOperation = autoAssignPreview.sprints.every(sprint => sprint.workItems.length === 0);
      
      if (isClearAllOperation) {
        console.log('🗑️ Clear All operation detected - updating sprints without backend sync');
        // Skip backend sync for Clear All to maintain cleared state
        onUpdateSprints(autoAssignPreview.sprints, false, false, true);
      } else {
        // For regular auto-assign operations, use normal sync
        onUpdateSprints(autoAssignPreview.sprints);
      }
      
      // Clear preview
      setAutoAssignPreview(null);
      console.log('✅ Auto-assign results saved successfully');
    } catch (error) {
      console.error('❌ Failed to save auto-assign results:', error);
      alert('❌ Failed to save assignments to database. Please try again.');
    }
  };

  // Clear auto-assign preview
  const clearAutoAssignPreview = () => {
    setAutoAssignPreview(null);
  };

  // Clear assignments from a specific sprint onwards
  const clearSprintsFrom = (startSprintIndex: number) => {
    const sprintsToUpdate = [...data.sprints];
    const workItemsToUpdate = [...data.workItems];
    
    // Get sprints to clear (from startSprintIndex to end)
    const sprintsToClear = upcomingSprints.slice(startSprintIndex);
    const sprintIdsToClear = new Set(sprintsToClear.map(s => s.id));
    
    // Remove assignments from work items for these sprints
    workItemsToUpdate.forEach((item, itemIndex) => {
      const updatedAssignedSprints = item.assignedSprints.filter(sprintId => 
        !sprintIdsToClear.has(sprintId)
      );
      
      if (updatedAssignedSprints.length !== item.assignedSprints.length) {
        workItemsToUpdate[itemIndex] = {
          ...item,
          assignedSprints: updatedAssignedSprints
        };
      }
    });
    
    onUpdateWorkItems(workItemsToUpdate);
    onUpdateSprints(sprintsToUpdate);
    
    console.log(`🗑️ Cleared assignments from sprint ${startSprintIndex + 1} onwards`);
  };

  // Clear all assignments (show as preview)
  const clearAllAssignments = () => {
    console.log('🗑️ CLEAR ALL CLICKED - Starting clear process...');
    console.log('🗑️ Original data.sprints sample:', data.sprints.slice(0, 3).map(s => ({ 
      id: s.id, 
      name: s.name, 
      workItemsCount: s.workItems.length 
    })));
    
    // Create completely new objects to ensure React detects the change
    const updatedWorkItems = data.workItems.map(item => ({
      ...item,
      assignedSprints: [],
      // Add a timestamp to force object reference change
      _clearTimestamp: Date.now()
    }));
    
    const updatedSprints = data.sprints.map(sprint => ({
      ...sprint,
      workItems: [],
      // Add a timestamp to force object reference change
      _clearTimestamp: Date.now()
    }));

    console.log('🗑️ Created updatedSprints sample:', updatedSprints.slice(0, 3).map(s => ({ 
      id: s.id, 
      name: s.name, 
      workItemsCount: s.workItems.length,
      timestamp: s._clearTimestamp
    })));

    const previewState = {
      workItems: updatedWorkItems,
      sprints: updatedSprints,
      isPreviewActive: true,
      possibleEndDate: null, // No end date for clear all
      // Add timestamp to force state change detection
      timestamp: Date.now()
    };
    
    console.log('🗑️ Setting preview state:', {
      isPreviewActive: previewState.isPreviewActive,
      sprintsCount: previewState.sprints.length,
      timestamp: previewState.timestamp
    });

    // Show as preview for user to save/discard
    console.log('🗑️ BEFORE setAutoAssignPreview - Current state:', autoAssignPreview?.isPreviewActive);
    setAutoAssignPreview(previewState);
    console.log('🗑️ AFTER setAutoAssignPreview - New state should be:', previewState.isPreviewActive);
    
    // Force a re-render check
    setTimeout(() => {
      console.log('🗑️ POST-TIMEOUT CHECK - State after 100ms:', autoAssignPreview?.isPreviewActive);
    }, 100);
    
    console.log('🗑️ CLEAR ALL COMPLETE - Preview state set!');
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
      
      // Determine work item skill using enhanced detection
      let updatedWorkItem = { ...workItem };
      
      // Use enhanced skill detection
      const detectedSkills = detectSkillsFromContent(workItem);
      console.log(`🔍 DEBUG: Work item "${workItem.title}" skill detection result:`, {
        currentSkills: workItem.requiredSkills,
        detectedSkills: detectedSkills,
        detectedLength: detectedSkills.length
      });
      
      // If we get a single skill back, apply it (regardless of current skills)
      if (detectedSkills.length === 1) {
        console.log(`🎯 Auto-detected skill: ${detectedSkills[0]} for "${workItem.title}"`);
        updatedWorkItem = {
          ...updatedWorkItem,
          requiredSkills: detectedSkills
        };
      } else if (detectedSkills.length === 0 || (detectedSkills.includes('frontend') && detectedSkills.includes('backend'))) {
        // No clear detection or both skills detected → Ask user only if item has multiple skills
        if (updatedWorkItem.requiredSkills.length > 1) {
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
      }
    
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
          
          // Check if already assigned to this sprint
          if (workItem.sprintId === sprintId) {
            console.log(`ℹ️ Work item "${workItem.title}" is already assigned to sprint ${targetSprint.name}`);
            alert(`ℹ️ "${workItem.title}" is already assigned to sprint "${targetSprint.name}"`);
            return;
          }
          
          console.log(`💾 Saving sprint assignment to database: ${itemId} → ${sprintId}`);
          await workItemsApi.assignToSprint(itemId, sprintId);
          console.log('✅ Sprint assignment saved to database');
        } catch (error: any) {
          console.error('❌ Failed to save to database:', error);
          
          // Show specific error message if available
          let errorMessage = 'Failed to save assignment. Please try again.';
          if (error?.response?.data?.error) {
            errorMessage = error.response.data.error;
          } else if (error?.message) {
            errorMessage = error.message;
          }
          
          alert(`❌ ${errorMessage}`);
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

  // Priority styling helper
  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'Critical':
        return 'bg-red-100 text-red-800 border border-red-300';
      case 'High':
        return 'bg-orange-100 text-orange-800 border border-orange-300';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800 border border-yellow-300';
      case 'Low':
        return 'bg-green-100 text-green-800 border border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-300';
    }
  };

  // Update epic priority function
  const updateEpicPriority = async (epicId: string, priority: 'Critical' | 'High' | 'Medium' | 'Low') => {
    try {
      console.log(`🎯 Updating epic priority: ${epicId} -> ${priority}`);
      
      // Use the consistent API service
      await workItemsApi.update(epicId, { priority });

      // Update local state - both the epic and its children's inherited priority
      const updatedWorkItems = data.workItems.map(item => {
        if (item.id === epicId) {
          // Update the epic itself
          console.log(`📝 Updating epic ${item.title} priority: ${item.priority} -> ${priority}`);
          return { ...item, priority };
        } else if (item.epicId === epicId) {
          // Update epic children to inherit new priority
          console.log(`👶 Updating epic child ${item.title} inherited priority: ${(item as any).parentEpicPriority} -> ${priority}`);
          return { ...item, parentEpicPriority: priority };
        } else if (item.isEpic && item.children) {
          // Update children within epic work items
          const updatedChildren = item.children.map(child => {
            if (child.epicId === epicId || item.id === epicId) {
              console.log(`👶 Updating nested child ${child.title} inherited priority: ${(child as any).parentEpicPriority} -> ${priority}`);
              return { ...child, parentEpicPriority: priority };
            }
            return child;
          });
          return item.id === epicId ? { ...item, priority, children: updatedChildren } : { ...item, children: updatedChildren };
        }
        return item;
      });
      
      onUpdateWorkItems(updatedWorkItems);
      
      console.log(`✅ Epic priority updated successfully - epic and all children updated`);
    } catch (error) {
      console.error('❌ Failed to update epic priority:', error);
      alert(`Failed to update epic priority: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
                    {(() => {
                      console.log('🎨 UI RENDER CHECK:', {
                        autoAssignPreview: autoAssignPreview,
                        isPreviewActive: autoAssignPreview?.isPreviewActive,
                        shouldShowPreview: autoAssignPreview?.isPreviewActive
                      });
                      return autoAssignPreview?.isPreviewActive;
                    })() ? (
                      // Preview mode - show Save/Clear buttons
                      <>
                        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          {autoAssignPreview.possibleEndDate ? (
                            `Preview Mode - End Date: ${format(autoAssignPreview.possibleEndDate, 'MMM dd, yyyy')}`
                          ) : (
                            'Preview Mode - Clear All Assignments'
                          )}
                        </div>
                <button
                  onClick={saveAutoAssignPreview}
                  className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button
                  onClick={clearAutoAssignPreview}
                  className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Clear
                </button>
              </>
            ) : (
              // Normal mode - show Auto-Assign and Clear All buttons
              (() => {
                console.log('🎨 RENDERING NORMAL MODE BUTTONS');
                return (
                  <>
                    <button
                      onClick={autoAssignItems}
                      className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
                    >
                      <Calculator className="h-4 w-4" />
                      Auto-Assign Items
                    </button>
                                    <button
                  onClick={() => {
                    console.log('🖱️ CLEAR ALL BUTTON CLICKED!');
                    clearAllAssignments();
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 flex items-center gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Clear All
                </button>
                  </>
                );
              })()
            )}
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
                              📋 {epic.jiraId ? (
                                <>
                                  <a 
                                    href={`https://cvs-hcd.atlassian.net/browse/${epic.jiraId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {epic.jiraId}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                  <span className="ml-1">- {epic.title}</span>
                                </>
                              ) : epic.title}
                              {/* Priority Badge */}
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityStyles(epic.priority || 'Medium')}`}>
                                {epic.priority || 'Medium'}
                              </span>
                            </div>
                            <div className="text-xs text-indigo-600 flex items-center justify-between">
                              <span>Epic • {epic.children?.length || 0} children • {epic.jiraId}</span>
                              {/* Priority Dropdown */}
                              <select
                                value={epic.priority || 'Medium'}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  updateEpicPriority(epic.id, e.target.value as 'Critical' | 'High' | 'Medium' | 'Low');
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs border border-indigo-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                <option value="Critical">Critical</option>
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                              </select>
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
                              // Apply enhanced skill detection for epic children
                              const detectedSkills = detectSkillsFromContent(child);
                              
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
                                    {child.jiraId ? (
                                      <>
                                        <a 
                                          href={`https://cvs-hcd.atlassian.net/browse/${child.jiraId}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                                          onClick={(e) => e.stopPropagation()}
                                          style={{ textDecoration: 'none' }}
                                        >
                                          {child.jiraId}
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                        <span style={{ marginLeft: '4px' }}>- {child.title}</span>
                                      </>
                                    ) : child.title}
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
          
          {(() => {
            console.log('🎨 QUARTER GROUPS RENDER:', {
              quarterCount: quarterGroups.length,
              previewActive: autoAssignPreview?.isPreviewActive,
              totalSprintsInGroups: quarterGroups.reduce((sum, qg) => sum + qg.sprints.length, 0)
            });
            return null;
          })()}
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
                      key={`${sprint.id}-${autoAssignPreview?.timestamp || 'normal'}`}
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
                        {(() => {
                          // DEBUG: Log what this specific sprint card is rendering
                          console.log(`🎨 RENDERING Sprint ${sprint.name}:`, {
                            sprintId: sprint.id,
                            assignedItemsLength: assignedItems.length,
                            assignedItemsIds: assignedItems.map(i => i.id),
                            previewActive: autoAssignPreview?.isPreviewActive,
                            timestamp: autoAssignPreview?.timestamp
                          });
                          return null;
                        })()}
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
                              <div className="flex items-center gap-2">
                                <div>
                                  {item.jiraId ? (
                                    <span className="font-medium">
                                      <a 
                                        href={`https://cvs-hcd.atlassian.net/browse/${item.jiraId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {item.jiraId}
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                      <span className="ml-1">- {item.title}</span>
                                    </span>
                                  ) : (
                                    <span className="font-medium">{item.title}</span>
                                  )}
                                  <span className="ml-2 text-gray-600">({item.estimateStoryPoints} pts)</span>
                                </div>
                                {/* Show priority for epic items or epic children */}
                                {(item.isEpic || item.epicId) && (
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityStyles(
                                    item.isEpic 
                                      ? (item.priority || 'Medium')
                                      : (data.workItems.find(wi => wi.id === item.epicId && wi.isEpic)?.priority || 'Medium')
                                  )}`}>
                                    {item.isEpic 
                                      ? (item.priority || 'Medium')
                                      : (data.workItems.find(wi => wi.id === item.epicId && wi.isEpic)?.priority || 'Medium')
                                    }
                                  </span>
                                )}
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