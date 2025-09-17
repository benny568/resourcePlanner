import React, { useState, useMemo, useEffect, useRef } from 'react';
import { WorkItem, Sprint, ResourcePlanningData } from '../types';
import { Calculator, Target, AlertTriangle, CheckCircle, ArrowRight, RotateCcw, ChevronDown, ChevronRight, Archive, Save, X, ExternalLink, BarChart3, TrendingUp, AlertCircle } from 'lucide-react';
import { format, isBefore, isAfter } from 'date-fns';
import { calculateSprintCapacity, calculateSprintSkillCapacities, canWorkItemBeAssignedToSprint, canWorkItemStartInSprint, getBlockedWorkItems, groupSprintsByQuarter } from '../utils/dateUtils';
import { workItemsApi, transformers, sprintsApi } from '../services/api';
import { detectSkillsFromContent } from '../utils/skillDetection';
import { generateVelocityAwareSprintPlan, analyzeVelocityTrends, analyzeTeamCapacity } from '../utils/velocityPrediction';

interface SprintPlanningProps {
  data: ResourcePlanningData;
  onUpdateWorkItems: (workItems: WorkItem[]) => void;
  onUpdateSprints: (sprints: Sprint[], useBatchOperation?: boolean, isRegeneration?: boolean, skipBackendSync?: boolean) => void;
}

// Helper function to get sprint name from assigned sprint IDs
const getSprintName = (assignedSprints: string[], allSprints: Sprint[]): string => {
  if (assignedSprints.length === 0) return 'ASSIGNED';

  // Get the first assigned sprint (assuming work items are typically assigned to one sprint)
  const sprintId = assignedSprints[0];
  const sprint = allSprints.find(s => s.id === sprintId);

  return sprint ? sprint.name : 'ASSIGNED';
};

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
  const [dragStart, setDragStart] = useState<{ x: number, y: number, itemId: string } | null>(null);
  
  // Refs to access current drag state in global handlers (avoid stale closures)
  const draggedItemRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number, y: number, itemId: string } | null>(null);
  
  // Force visual cleanup function
  const forceCleanupVisualState = () => {
    console.log('🧹 MANUAL CLEANUP: Forcing visual state cleanup');
    
    // Clear React state
    setDraggedItem(null);
    setDragStart(null);
    setHideDropZones(false);
    
    // Clear DOM styling
    document.querySelectorAll('[data-sprint-id]').forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.classList.remove('border-2', 'border-blue-300', 'bg-blue-50/30', 'shadow-md', 'cursor-copy', 'ring-1', 'ring-blue-200');
      htmlEl.classList.add('border', 'border-gray-200');
      htmlEl.style.minHeight = 'auto';
      htmlEl.style.cursor = 'default';
    });
    
    // Reset dragged item visual effects
    document.querySelectorAll('[style*="opacity: 0.7"]').forEach((el: any) => {
      el.style.opacity = '1';
      el.style.transform = 'scale(1)';
      el.style.pointerEvents = 'auto';
    });
    
    // Reset body cursor
    document.body.style.cursor = 'default';
  };
  
  // Keep refs updated
  React.useEffect(() => {
    draggedItemRef.current = draggedItem;
  }, [draggedItem]);
  
  React.useEffect(() => {
    dragStartRef.current = dragStart;
  }, [dragStart]);
  
  const [expandedEpicsUnassigned, setExpandedEpicsUnassigned] = useState<Set<string>>(new Set());
  const [expandedEpicsSprint, setExpandedEpicsSprint] = useState<Set<string>>(new Set());
  // Initialize all sprints as collapsed by default
  const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set());
  const [hideDropZones, setHideDropZones] = useState(false);
  const [showBottleneckAnalysis, setShowBottleneckAnalysis] = useState<boolean>(false);

  // Auto-assign preview state
  const [autoAssignPreview, setAutoAssignPreview] = useState<{
    workItems: WorkItem[];
    sprints: Sprint[];
    isPreviewActive: boolean;
    possibleEndDate?: Date | null;
    timestamp?: number;
  } | null>(null);

  // Velocity insights state
  const [showVelocityInsights, setShowVelocityInsights] = useState(false);

  // Helper function to create new sprints based on sprint configuration
  const createNewSprints = (fromExistingSprints: Sprint[], sprintConfig: any, count: number = 1): Sprint[] => {
    const newSprints: Sprint[] = [];
    const lastSprint = fromExistingSprints[fromExistingSprints.length - 1];

    if (!lastSprint) {
      console.error('❌ Cannot create new sprints: no existing sprints found');
      return [];
    }

    // Start the new sprint(s) after the last existing sprint
    let currentSprintStart = new Date(lastSprint.endDate);
    currentSprintStart.setDate(currentSprintStart.getDate() + 1); // Next day after last sprint ends

    for (let i = 0; i < count; i++) {
      const sprintEnd = new Date(currentSprintStart);
      sprintEnd.setDate(sprintEnd.getDate() + sprintConfig.sprintDurationDays - 1);

      // Calculate sprint number by counting existing sprints plus new ones
      const totalSprintCount = fromExistingSprints.length + newSprints.length + 1;

      // Get quarter info for naming
      const quarterInfo = getQuarterInfo(currentSprintStart);

      // Count sprints in this quarter to determine sprint number within quarter
      const sprintsInQuarter = [...fromExistingSprints, ...newSprints].filter(s => {
        const sQuarter = getQuarterInfo(s.startDate);
        return sQuarter.quarterString === quarterInfo.quarterString;
      });

      const quarterSprintNumber = sprintsInQuarter.length + 1;

      const newSprint: Sprint = {
        id: `sprint-${new Date().getFullYear()}-${totalSprintCount}`,
        name: `${quarterInfo.quarterString} Sprint ${quarterSprintNumber}`,
        startDate: new Date(currentSprintStart),
        endDate: sprintEnd,
        plannedVelocity: sprintConfig.defaultVelocity,
        workItems: []
      };

      newSprints.push(newSprint);
      console.log(`➕ Created new sprint: ${newSprint.name} (${format(newSprint.startDate, 'MMM dd')} - ${format(newSprint.endDate, 'MMM dd, yyyy')})`);

      // Move to next sprint start date
      currentSprintStart = new Date(sprintEnd);
      currentSprintStart.setDate(currentSprintStart.getDate() + 1);
    }

    return newSprints;
  };

  // Helper function to get quarter info (needed for sprint naming)
  const getQuarterInfo = (date: Date) => {
    const month = date.getMonth() + 1; // getMonth() returns 0-11
    const year = date.getFullYear();

    let quarter: number;
    if (month <= 3) quarter = 1;
    else if (month <= 6) quarter = 2;
    else if (month <= 9) quarter = 3;
    else quarter = 4;

    return {
      quarter,
      year,
      quarterString: `REF Q${quarter} ${year}`
    };
  };

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

  // Manual cleanup function with detailed debugging
  const clearDragState = () => {
    console.log('🧹 MANUAL CLEANUP STARTING: Current state:', {
      draggedItem,
      dragStart,
      hideDropZones
    });
    
    setDraggedItem(null);
    setDragStart(null);
    setHideDropZones(false);
    
    console.log('🧹 React state cleared, now cleaning DOM...');
    
    // Force immediate visual cleanup
    const sprintElements = document.querySelectorAll('[data-sprint-id]');
    console.log(`🧹 Found ${sprintElements.length} sprint elements to clean`);
    
    sprintElements.forEach((el, index) => {
      const htmlEl = el as HTMLElement;
      const hadBlueClasses = htmlEl.classList.contains('border-blue-300');
      
      htmlEl.classList.remove('border-2', 'border-blue-300', 'bg-blue-50/30', 'shadow-md', 'cursor-copy', 'ring-1', 'ring-blue-200');
      htmlEl.classList.add('border', 'border-gray-200');
      htmlEl.style.cursor = 'default';
      
      if (hadBlueClasses) {
        console.log(`🧹 Cleaned element ${index} - removed blue classes`);
      }
    });
    
    console.log('🧹 MANUAL CLEANUP COMPLETED');
  };

  // Add escape key to clear drag state
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log(`⌨️ KEY DOWN: ${e.key}`);
      if (e.key === 'Escape') {
        console.log('🚨 ESCAPE KEY PRESSED: About to clear drag state');
        clearDragState();
      }
    };
    
    console.log('📎 ADDING ESCAPE KEY LISTENER');
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      console.log('📎 REMOVING ESCAPE KEY LISTENER');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [clearDragState]);

  // Simple drag and drop system 
  React.useEffect(() => {
    console.log('🎯 Drag and Drop System Initialized');
  }, []);


  // Toggle epic expansion in unassigned section
  const toggleEpicExpansionUnassigned = (epicId: string) => {
    const newExpanded = new Set(expandedEpicsUnassigned);
    if (newExpanded.has(epicId)) {
      newExpanded.delete(epicId);
      console.log(`🔽 COLLAPSING UNASSIGNED EPIC: ${epicId}`);
    } else {
      newExpanded.add(epicId);
      console.log(`🔼 EXPANDING UNASSIGNED EPIC: ${epicId}`);
    }
    setExpandedEpicsUnassigned(newExpanded);
  };

  // Toggle epic expansion in sprint section
  const toggleEpicExpansionSprint = (epicId: string) => {
    const newExpanded = new Set(expandedEpicsSprint);
    if (newExpanded.has(epicId)) {
      newExpanded.delete(epicId);
      console.log(`🔽 COLLAPSING SPRINT EPIC: ${epicId}`);
    } else {
      newExpanded.add(epicId);
      console.log(`🔼 EXPANDING SPRINT EPIC: ${epicId}`);
    }
    setExpandedEpicsSprint(newExpanded);
  };

  // Toggle sprint expansion
  const toggleSprintExpansion = (sprintId: string) => {
    const newExpanded = new Set(expandedSprints);
    if (newExpanded.has(sprintId)) {
      newExpanded.delete(sprintId);
      console.log(`🔽 COLLAPSING SPRINT: ${sprintId}`);
    } else {
      newExpanded.add(sprintId);
      console.log(`🔼 EXPANDING SPRINT: ${sprintId}`);
    }
    setExpandedSprints(newExpanded);
    console.log(`📅 EXPANDED SPRINTS:`, Array.from(newExpanded));
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

  // Get active sprints (not completed by user)
  const activeSprints = currentSprints.filter(sprint =>
    sprint.status !== 'completed'
  ).slice(0, 12); // Show next 12 sprints to better showcase quarterly grouping

  // Group sprints by quarter
  const quarterGroups = useMemo(() => {
    // DEBUG: Check for duplicate sprints before grouping
    const sprintIds = activeSprints.map(s => s.id);
    const uniqueSprintIds = [...new Set(sprintIds)];
    if (sprintIds.length !== uniqueSprintIds.length) {
      console.error('🚨 DUPLICATE SPRINTS DETECTED!');
      console.error('  - Total sprints:', sprintIds.length);
      console.error('  - Unique sprint IDs:', uniqueSprintIds.length);
      console.error('  - Duplicate IDs:', sprintIds.filter((id, index) => sprintIds.indexOf(id) !== index));
      console.error('  - Full sprint list:', activeSprints.map(s => ({ id: s.id, name: s.name })));
    }

    // DEDUPLICATION: Remove duplicate sprints by name (keep the first occurrence)
    const sprintsByName = new Map();
    const deduplicatedSprints = activeSprints.filter(sprint => {
      if (sprintsByName.has(sprint.name)) {
        console.warn(`🗑️ Removing duplicate sprint: "${sprint.name}" (ID: ${sprint.id})`);
        return false; // Skip this duplicate
      } else {
        sprintsByName.set(sprint.name, sprint);
        return true; // Keep this sprint
      }
    });

    if (deduplicatedSprints.length !== activeSprints.length) {
      console.log(`✅ Deduplication complete: ${activeSprints.length} → ${deduplicatedSprints.length} sprints`);
    }

    return groupSprintsByQuarter(deduplicatedSprints);
  }, [activeSprints]);

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
      const assignedPoints = allAssignedItems.reduce((sum, item) => sum + (item.estimateStoryPoints || 0), 0);

      // Calculate skill-specific capacities
      const skillCapacities = calculateSprintSkillCapacities(sprint, data.teamMembers, data.publicHolidays);
      const capacity = skillCapacities.total;

      // Calculate skill-specific assignments
      const frontendItems = allAssignedItems.filter(item => item.requiredSkills.includes('frontend'));
      const backendItems = allAssignedItems.filter(item => item.requiredSkills.includes('backend'));
      const frontendPoints = frontendItems.reduce((sum, item) => sum + (item.estimateStoryPoints || 0), 0);
      const backendPoints = backendItems.reduce((sum, item) => sum + (item.estimateStoryPoints || 0), 0);

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

  // Comprehensive bottleneck analysis for UI display
  const analyzeCapacityBottlenecks = () => {
    if (sprintData.length === 0) return null;

    const sampleSprint = sprintData[0];
    const frontendCapacity = sampleSprint.skillCapacities.frontend;
    const backendCapacity = sampleSprint.skillCapacities.backend;
    const totalCapacity = sampleSprint.capacity;

    const frontendRatio = frontendCapacity / totalCapacity;
    const backendRatio = backendCapacity / totalCapacity;

    // Analyze work items skill requirements
    const workItemsRequiringFrontend = data.workItems.filter(item =>
      item.requiredSkills.includes('frontend')).length;
    const workItemsRequiringBackend = data.workItems.filter(item =>
      item.requiredSkills.includes('backend')).length;
    const workItemsRequiringBoth = data.workItems.filter(item =>
      item.requiredSkills.includes('frontend') && item.requiredSkills.includes('backend')).length;

    // Calculate current utilization across all sprints
    console.log(`🔍 Analyzing ${sprintData.length} sprints for capacity bottlenecks`);
    let totalFrontendAssigned = 0;
    let totalBackendAssigned = 0;
    let totalOverallAssigned = 0;
    let totalCapacityAvailable = 0;
    let totalFrontendCapacityAvailable = 0;
    let totalBackendCapacityAvailable = 0;

    sprintData.forEach(sprintInfo => {
      const assignedItems = sprintInfo.assignedItems;
      console.log(`🔍 Sprint ${sprintInfo.sprint.name}: ${assignedItems.length} items, total points: ${assignedItems.reduce((sum, item) => sum + (item.estimateStoryPoints || 0), 0)}`);

      assignedItems.forEach(item => {
        // For overall utilization, count each item only once
        totalOverallAssigned += (item.estimateStoryPoints || 0);

        // For skill-specific utilization, allocate points based on required skills
        if (item.requiredSkills.includes('frontend') && item.requiredSkills.includes('backend')) {
          // Split points between frontend and backend for items requiring both
          totalFrontendAssigned += (item.estimateStoryPoints || 0) / 2;
          totalBackendAssigned += (item.estimateStoryPoints || 0) / 2;
        } else if (item.requiredSkills.includes('frontend')) {
          // Frontend-only items
          totalFrontendAssigned += (item.estimateStoryPoints || 0);
        } else if (item.requiredSkills.includes('backend')) {
          // Backend-only items
          totalBackendAssigned += (item.estimateStoryPoints || 0);
        }
      });
      totalCapacityAvailable += sprintInfo.capacity;
      totalFrontendCapacityAvailable += sprintInfo.skillCapacities?.frontend || 0;
      totalBackendCapacityAvailable += sprintInfo.skillCapacities?.backend || 0;
    });

    const frontendUtilization = totalFrontendCapacityAvailable > 0 ?
      (totalFrontendAssigned / totalFrontendCapacityAvailable) * 100 : 0;
    const backendUtilization = totalBackendCapacityAvailable > 0 ?
      (totalBackendAssigned / totalBackendCapacityAvailable) * 100 : 0;
    const overallUtilization = totalCapacityAvailable > 0 ?
      (totalOverallAssigned / totalCapacityAvailable) * 100 : 0;

    // Debug logging for utilization calculation
    console.log('🔍 UTILIZATION DEBUG:', {
      totalFrontendAssigned,
      totalBackendAssigned,
      totalOverallAssigned,
      totalFrontendCapacityAvailable,
      totalBackendCapacityAvailable,
      totalCapacityAvailable,
      frontendUtilization: frontendUtilization.toFixed(1) + '%',
      backendUtilization: backendUtilization.toFixed(1) + '%',
      overallUtilization: overallUtilization.toFixed(1) + '%'
    });

    // Determine bottleneck
    const isBottleneck = frontendRatio < 0.4 || backendRatio < 0.4;
    const limitingSkill = frontendRatio < backendRatio ? 'frontend' : 'backend';
    const limitingCapacity = limitingSkill === 'frontend' ? frontendCapacity : backendCapacity;
    const limitingRatio = limitingSkill === 'frontend' ? frontendRatio : backendRatio;
    const limitingUtilization = limitingSkill === 'frontend' ? frontendUtilization : backendUtilization;

    return {
      isBottleneck,
      limitingSkill,
      limitingCapacity,
      limitingRatio,
      limitingUtilization,
      frontendCapacity,
      backendCapacity,
      totalCapacity,
      frontendRatio,
      backendRatio,
      frontendUtilization,
      backendUtilization,
      overallUtilization,
      workItemsRequiringFrontend,
      workItemsRequiringBackend,
      workItemsRequiringBoth,
      totalFrontendCapacityAvailable,
      totalBackendCapacityAvailable,
      totalCapacityAvailable
    };
  };

  // Check for skill capacity bottlenecks before auto-assign
  const checkSkillBottlenecks = () => {
    const sampleSprint = sprintData[0];
    if (!sampleSprint) {
      console.log('🚨 No sprint data available for bottleneck check');
      return null;
    }

    const frontendCapacity = sampleSprint.skillCapacities.frontend;
    const backendCapacity = sampleSprint.skillCapacities.backend;
    const totalCapacity = sampleSprint.capacity;

    console.log('🔍 BOTTLENECK CHECK:', {
      frontendCapacity,
      backendCapacity,
      totalCapacity,
      sprintName: sampleSprint.sprint.name
    });

    const frontendRatio = frontendCapacity / totalCapacity;
    const backendRatio = backendCapacity / totalCapacity;

    console.log('📊 CAPACITY RATIOS:', {
      frontendRatio: `${(frontendRatio * 100).toFixed(1)}%`,
      backendRatio: `${(backendRatio * 100).toFixed(1)}%`,
      frontendUnder40: frontendRatio < 0.4,
      backendUnder40: backendRatio < 0.4
    });

    // Check for significant imbalance (one skill < 40% of total capacity)
    if (frontendRatio < 0.4 || backendRatio < 0.4) {
      const limitingSkill = frontendRatio < backendRatio ? 'frontend' : 'backend';
      const limitingCapacity = limitingSkill === 'frontend' ? frontendCapacity : backendCapacity;
      const limitingRatio = limitingSkill === 'frontend' ? frontendRatio : backendRatio;

      const bottleneck = {
        limitingSkill,
        limitingCapacity,
        limitingRatio,
        maxUtilization: (limitingCapacity / totalCapacity) * 100
      };

      console.log('⚠️ BOTTLENECK DETECTED:', bottleneck);
      return bottleneck;
    }

    console.log('✅ No bottleneck detected - capacities are balanced');
    return null;
  };

  // Enhanced Auto-Assign Items with 100% capacity targeting and preview
  const autoAssignItems = () => {
    console.log('🚀 AUTO-ASSIGN STARTED - Function called');
    // Check for skill bottlenecks first
    let bottleneck = null;
    try {
      bottleneck = checkSkillBottlenecks();
    } catch (error) {
      console.error('❌ Error in checkSkillBottlenecks:', error);
    }
    if (bottleneck) {
      const proceed = confirm(
        `⚠️ SKILL CAPACITY BOTTLENECK DETECTED\n\n` +
        `Your team has a ${bottleneck.limitingSkill} capacity bottleneck:\n` +
        `• ${bottleneck.limitingSkill.charAt(0).toUpperCase() + bottleneck.limitingSkill.slice(1)} capacity: ${bottleneck.limitingCapacity.toFixed(1)} points (${(bottleneck.limitingRatio * 100).toFixed(1)}% of total)\n` +
        `• This limits sprint utilization to ~${bottleneck.maxUtilization.toFixed(0)}% instead of 100%\n\n` +
        `Recommendations:\n` +
        `1. Add ${bottleneck.limitingSkill} skills to existing team members\n` +
        `2. Hire more ${bottleneck.limitingSkill} developers\n` +
        `3. Review work item skill classifications\n\n` +
        `Continue with auto-assign anyway?`
      );

      if (!proceed) {
        return;
      }
    }
    const updatedWorkItems = [...data.workItems];
    let updatedSprints = [...data.sprints];

    // Apply velocity-aware planning if historical data is available
    const velocityPlan = generateVelocityAwareSprintPlan(updatedSprints, updatedWorkItems, data.teamMembers);
    if (velocityPlan.velocityInsights.analysis.sprintsWithData > 0) {
      console.log('📊 Applying velocity-aware planning with historical data');
      console.log('📈 Velocity insights:', velocityPlan.velocityInsights);
      updatedSprints = velocityPlan.updatedSprints;
    }

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

    // Track sprint utilizations for 100% capacity targeting
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
      const targetUtilization = 1.0; // Fill sprints to 100% capacity

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
        // For items requiring both skills, use a more balanced approach
        const skillCapacityCheck = (() => {
          if (item.requiredSkills.includes('frontend') && item.requiredSkills.includes('backend')) {
            // For full-stack items, check if either skill can accommodate the work
            // This allows better utilization when one skill has more capacity
            const newFrontendUtil = (currentUtilization.assignedFrontend + item.estimateStoryPoints) / currentUtilization.frontendCapacity;
            const newBackendUtil = (currentUtilization.assignedBackend + item.estimateStoryPoints) / currentUtilization.backendCapacity;

            console.log(`   🔄 Full-stack item check:`);
            console.log(`   🎨 Frontend: ${currentUtilization.assignedFrontend} + ${item.estimateStoryPoints} = ${currentUtilization.assignedFrontend + item.estimateStoryPoints} / ${currentUtilization.frontendCapacity} = ${newFrontendUtil * 100}% (target: ${targetUtilization * 100}%)`);
            console.log(`   ⚙️ Backend: ${currentUtilization.assignedBackend} + ${item.estimateStoryPoints} = ${currentUtilization.assignedBackend + item.estimateStoryPoints} / ${currentUtilization.backendCapacity} = ${newBackendUtil * 100}% (target: ${targetUtilization * 100}%)`);

            // Allow assignment if the average utilization is within target
            const avgUtil = (newFrontendUtil + newBackendUtil) / 2;
            console.log(`   📊 Average utilization: ${avgUtil * 100}% (target: ${targetUtilization * 100}%)`);
            return avgUtil <= targetUtilization;
          } else {
            // For single-skill items, use the original strict checking
            return item.requiredSkills.every(skill => {
              if (skill === 'frontend') {
                const newFrontendUtil = (currentUtilization.assignedFrontend + item.estimateStoryPoints) / currentUtilization.frontendCapacity;
                console.log(`   🎨 Frontend-only check: ${newFrontendUtil * 100}% (target: ${targetUtilization * 100}%)`);
                return newFrontendUtil <= targetUtilization;
              } else if (skill === 'backend') {
                const newBackendUtil = (currentUtilization.assignedBackend + item.estimateStoryPoints) / currentUtilization.backendCapacity;
                console.log(`   ⚙️ Backend-only check: ${newBackendUtil * 100}% (target: ${targetUtilization * 100}%)`);
                return newBackendUtil <= targetUtilization;
              }
              return true;
            });
          }
        })();

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
        console.log(`🔄 Item ${item.title} could not be assigned to existing sprints - creating new sprint...`);

        // Create a new sprint to accommodate this item
        const newSprints = createNewSprints(updatedSprints, data.sprintConfig, 1);

        if (newSprints.length > 0) {
          const newSprint = newSprints[0];
          updatedSprints.push(newSprint);

          // Try to assign the item to the new sprint
          const skillCapacities = calculateSprintSkillCapacities(newSprint, data.teamMembers, data.publicHolidays);

          // Check if item can be assigned to the new sprint
          const skillRequired = item.requiredSkills[0]; // Primary skill for this item
          const skillCapacityAvailable = skillCapacities[skillRequired] || 0;

          if (item.estimateStoryPoints <= skillCapacityAvailable) {
            // Assign the item to the new sprint
            newSprint.workItems.push(item.id);

            // Update work item to reflect sprint assignment
            const workItemIndex = updatedWorkItems.findIndex(wi => wi.id === item.id);
            if (workItemIndex !== -1) {
              updatedWorkItems[workItemIndex] = {
                ...updatedWorkItems[workItemIndex],
                assignedSprints: [newSprint.id]
              };
            }

            console.log(`✅ Assigned "${item.title}" to newly created sprint "${newSprint.name}"`);
          } else {
            console.log(`❌ Even new sprint doesn't have enough ${skillRequired} capacity (${skillCapacityAvailable}) for item "${item.title}" (${item.estimateStoryPoints})`);
          }
        } else {
          console.log(`❌ Failed to create new sprint for item "${item.title}"`);
        }
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
        
        // Clean up drag state on error
        setDraggedItem(null);
        setDragStart(null);
        setHideDropZones(false);
        dropHandledRef.current = false;
        
        return;
      }

      // Check if already assigned to this sprint
      if (workItem.assignedSprints.includes(sprintId)) {
        console.log(`Item ${itemId} already assigned to sprint ${sprintId}`);
        alert(`"${workItem.title}" is already assigned to this sprint.`);
        
        // Clean up drag state on error
        setDraggedItem(null);
        setDragStart(null);
        setHideDropZones(false);
        dropHandledRef.current = false;
        
        return;
      }

      // Determine work item skill using enhanced detection
      let updatedWorkItem = { ...workItem };

      // Use enhanced skill detection
      const detectedSkills = detectSkillsFromContent(workItem);

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

          // Note: Already checked assignedSprints earlier, no need for additional check here

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
          
          // Clean up drag state on error
          setDraggedItem(null);
          setDragStart(null);
          setHideDropZones(false);
          dropHandledRef.current = false;
          
          return;
        }
      } else {
        // This is an imported epic child that hasn't been converted to a work item yet
        const message = `Cannot assign "${workItem.title}" to sprint. This item needs to be converted to a work item first.`;
        console.log(`❌ ${message}`);
        alert(`❌ ${message}\n\nPlease:\n1. Go to the Epics tab\n2. Click "Add to Work Items" for the parent epic\n3. Then assign the work items to sprints`);
        
        // Clean up drag state on error
        setDraggedItem(null);
        setDragStart(null);
        setHideDropZones(false);
        dropHandledRef.current = false;
        
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

  // Complete a sprint (mark as completed, remove from planning view)
  const completeSprint = async (sprintId: string) => {
    try {
      const sprint = data.sprints.find(s => s.id === sprintId);
      if (!sprint) {
        alert('Sprint not found');
        return;
      }

      // Confirm with user before completing
      const confirmMessage = `Are you sure you want to mark "${sprint.name}" as completed?\n\nThis will remove it from the sprint planning view.`;

      if (!confirm(confirmMessage)) {
        return;
      }

      console.log(`✅ Marking sprint as completed: ${sprintId} ("${sprint.name}")`);

      // Mark sprint as completed
      const updatedSprints = data.sprints.map(s =>
        s.id === sprintId ? { ...s, status: 'completed' as const } : s
      );
      await onUpdateSprints(updatedSprints);

      console.log(`✅ Sprint "${sprint.name}" marked as completed`);
    } catch (error) {
      console.error('❌ Error completing sprint:', error);
      alert('Failed to complete sprint. Please try again.');
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
            {draggedItem && (
              <button
                onClick={clearDragState}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                🚫 Exit Drag Mode
              </button>
            )}
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
                      onClick={() => setShowVelocityInsights(!showVelocityInsights)}
                      className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center gap-2"
                    >
                      <Target className="h-4 w-4" />
                      Velocity Insights
                    </button>
                    <button
                      onClick={() => setShowBottleneckAnalysis(!showBottleneckAnalysis)}
                      className="px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 flex items-center gap-2"
                    >
                      <BarChart3 className="h-4 w-4" />
                      Capacity Analysis
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

      {/* Velocity Insights Panel */}
      {showVelocityInsights && (() => {
        const velocityAnalysis = analyzeVelocityTrends(data.sprints);
        const teamCapacity = analyzeTeamCapacity(data.teamMembers, data.workItems, velocityAnalysis);
        const velocityPlan = generateVelocityAwareSprintPlan(data.sprints, data.workItems, data.teamMembers);

        return (
          <div className="mb-6 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg shadow-lg p-6 border border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Target className="h-6 w-6 text-blue-600" />
                📊 Velocity Insights & Planning Intelligence
              </h3>
              <button
                onClick={() => setShowVelocityInsights(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Historical Velocity Analysis */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  📈 Historical Performance
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Average Velocity:</span>
                    <span className="font-bold text-blue-600">{velocityAnalysis.averageVelocity} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Velocity Trend:</span>
                    <span className={`font-bold ${velocityAnalysis.velocityTrend === 'improving' ? 'text-green-600' :
                      velocityAnalysis.velocityTrend === 'declining' ? 'text-red-600' : 'text-gray-600'
                      }`}>
                      {velocityAnalysis.velocityTrend === 'improving' ? '📈 Improving' :
                        velocityAnalysis.velocityTrend === 'declining' ? '📉 Declining' : '📊 Stable'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Confidence Level:</span>
                    <span className={`font-bold ${velocityAnalysis.confidenceLevel === 'high' ? 'text-green-600' :
                      velocityAnalysis.confidenceLevel === 'medium' ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                      {velocityAnalysis.confidenceLevel.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Sprints with Data:</span>
                    <span className="font-bold text-purple-600">{velocityAnalysis.sprintsWithData}</span>
                  </div>
                  {velocityAnalysis.lastActualVelocity && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Last Sprint:</span>
                      <span className="font-bold text-blue-600">{velocityAnalysis.lastActualVelocity} pts</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm font-medium text-gray-700">Predicted Velocity:</span>
                    <span className="font-bold text-green-600">{velocityAnalysis.predictedVelocity} pts</span>
                  </div>
                </div>
              </div>

              {/* Team Capacity Analysis */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  👥 Team Capacity
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Frontend Developers:</span>
                    <span className="font-bold text-blue-600">{teamCapacity.frontendCapacity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Backend Developers:</span>
                    <span className="font-bold text-green-600">{teamCapacity.backendCapacity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Team Members:</span>
                    <span className="font-bold text-purple-600">{teamCapacity.totalCapacity}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm font-medium text-gray-700">Recommended Utilization:</span>
                    <span className="font-bold text-yellow-600">
                      {Math.round(teamCapacity.utilizationRecommendation * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  💡 Recommendations
                </h4>
                <div className="space-y-2">
                  {velocityPlan.velocityInsights.recommendations.length > 0 ? (
                    velocityPlan.velocityInsights.recommendations.map((rec, index) => (
                      <div key={index} className="text-sm text-gray-700 p-2 bg-yellow-50 rounded border-l-4 border-yellow-400">
                        {rec}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-500 italic">
                      All systems are running optimally! 🎯
                    </div>
                  )}

                  {velocityAnalysis.sprintsWithData === 0 && (
                    <div className="text-sm text-blue-700 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                      💡 Tip: Use the <strong>Sprint Sync</strong> tab to import completed sprint data from Jira for better velocity predictions.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bottleneck Analysis Panel */}
      {showBottleneckAnalysis && (() => {
        const analysis = analyzeCapacityBottlenecks();
        if (!analysis) return null;

        return (
          <div className="mb-6 bg-gradient-to-r from-amber-50 to-red-50 rounded-lg shadow-lg p-6 border border-amber-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-amber-600" />
                🔍 Capacity Bottleneck Analysis
              </h3>
              <button
                onClick={() => setShowBottleneckAnalysis(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Capacity Distribution */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  📊 Team Capacity Distribution
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Frontend Capacity:</span>
                    <div className="text-right">
                      <span className="font-bold text-blue-600">{analysis.frontendCapacity.toFixed(1)} pts</span>
                      <div className="text-xs text-gray-500">({(analysis.frontendRatio * 100).toFixed(1)}% of total)</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Backend Capacity:</span>
                    <div className="text-right">
                      <span className="font-bold text-green-600">{analysis.backendCapacity.toFixed(1)} pts</span>
                      <div className="text-xs text-gray-500">({(analysis.backendRatio * 100).toFixed(1)}% of total)</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm font-medium text-gray-700">Total Capacity:</span>
                    <span className="font-bold text-gray-800">{analysis.totalCapacity.toFixed(1)} pts</span>
                  </div>

                  {/* Visual capacity bar */}
                  <div className="mt-4">
                    <div className="flex h-4 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 flex items-center justify-center text-xs text-white font-medium"
                        style={{ width: `${analysis.frontendRatio * 100}%` }}
                      >
                        {analysis.frontendRatio > 0.15 ? 'FE' : ''}
                      </div>
                      <div
                        className="bg-green-500 flex items-center justify-center text-xs text-white font-medium"
                        style={{ width: `${analysis.backendRatio * 100}%` }}
                      >
                        {analysis.backendRatio > 0.15 ? 'BE' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Utilization */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  📈 Current Utilization
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Frontend Utilization:</span>
                    <div className="text-right">
                      <span className={`font-bold ${analysis.frontendUtilization > 70 ? 'text-red-600' : analysis.frontendUtilization > 50 ? 'text-amber-600' : 'text-green-600'}`}>
                        {analysis.frontendUtilization.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Backend Utilization:</span>
                    <div className="text-right">
                      <span className={`font-bold ${analysis.backendUtilization > 70 ? 'text-red-600' : analysis.backendUtilization > 50 ? 'text-amber-600' : 'text-green-600'}`}>
                        {analysis.backendUtilization.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm font-medium text-gray-700">Overall Utilization:</span>
                    <span className={`font-bold ${analysis.overallUtilization > 70 ? 'text-red-600' : analysis.overallUtilization > 50 ? 'text-amber-600' : 'text-green-600'}`}>
                      {analysis.overallUtilization.toFixed(1)}%
                    </span>
                  </div>

                  {/* Bottleneck indicator */}
                  {analysis.isBottleneck && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 text-red-700 font-medium">
                        <AlertCircle className="h-4 w-4" />
                        Bottleneck Detected!
                      </div>
                      <div className="text-sm text-red-600 mt-1">
                        <strong>{analysis.limitingSkill.charAt(0).toUpperCase() + analysis.limitingSkill.slice(1)}</strong> capacity
                        ({(analysis.limitingRatio * 100).toFixed(1)}% of total) is limiting sprint utilization to {analysis.limitingUtilization.toFixed(1)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Recommendations */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  💡 Recommendations
                </h4>
                <div className="space-y-3">
                  {analysis.isBottleneck ? (
                    <>
                      <div className="text-sm text-red-700 p-2 bg-red-50 rounded border-l-4 border-red-400">
                        <strong>🚨 {analysis.limitingSkill.charAt(0).toUpperCase() + analysis.limitingSkill.slice(1)} Bottleneck:</strong>
                        <br />Your {analysis.limitingSkill} team is at {analysis.limitingUtilization.toFixed(1)}% utilization, preventing higher sprint fill rates.
                      </div>

                      <div className="text-sm text-amber-700 p-2 bg-amber-50 rounded border-l-4 border-amber-400">
                        <strong>📋 Work Item Distribution:</strong>
                        <br />• {analysis.workItemsRequiringFrontend} items need Frontend
                        <br />• {analysis.workItemsRequiringBackend} items need Backend
                        <br />• {analysis.workItemsRequiringBoth} items need Both skills
                      </div>

                      <div className="text-sm text-blue-700 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                        <strong>🎯 Solutions:</strong>
                        <br />• Cross-train team members in {analysis.limitingSkill}
                        <br />• Split large {analysis.limitingSkill} items into smaller pieces
                        <br />• Hire more {analysis.limitingSkill} developers
                        <br />• Reduce {analysis.limitingSkill} dependencies where possible
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-green-700 p-2 bg-green-50 rounded border-l-4 border-green-400">
                      <strong>✅ Balanced Capacity:</strong>
                      <br />Your team capacity is well-balanced. Auto-assign should achieve close to 70% utilization.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Container height doubled for better visibility */}
      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-50px)] h-[calc(100vh-50px)]">
        {/* Unassigned Items */}
        <div className="w-full lg:w-1/3 bg-white rounded-lg shadow p-6 flex flex-col">
          <h3 className="text-lg font-semibold mb-4">Unassigned Work Items</h3>





          {unassignedItems.length === 0 && unassignedEpicWorkItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-300" />
              <p>All items are assigned!</p>
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">{/* Added independent scrolling */}
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
                          // Only start drag on left mouse button
                          if (e.button !== 0) return;

                          console.log(`🔽 POINTER DOWN: Starting immediate drag for "${item.title}"`);
                          // Start drag immediately - simple and clean
                          setDraggedItem(item.id);
                          setDragStart({
                            x: e.clientX,
                            y: e.clientY,
                            itemId: item.id
                          });
                          setHideDropZones(false);
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

                                // Mark drop as handled
                                dropHandledRef.current = true;
                                
                                const itemToAssign = draggedItem;
                                
                                // Clear drag state immediately
                                setDraggedItem(null);
                                setDragStart(null);
                                setHideDropZones(false);

                                // Assign to sprint
                                assignItemToSprint(itemToAssign, sprintId);
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
                                  className={`px-1 py-0.5 rounded text-xs font-medium ${skill === 'frontend'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-orange-100 text-orange-800'
                                    }`}
                                >
                                  {skill === 'frontend' ? 'FE' : 'BE'}
                                </span>
                              ))}
                            </div>
                          </div>
                          <span className={`font-medium ${isBefore(item.requiredCompletionDate, new Date()) ? 'text-red-600' : ''
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
                                    className={`px-1 py-0.5 rounded text-xs font-medium ${skill === 'frontend'
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-orange-100 text-orange-800'
                                      }`}
                                  >
                                    {skill === 'frontend' ? 'FE' : 'BE'}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <span className={`font-medium ${isBefore(item.requiredCompletionDate, new Date()) ? 'text-red-600' : ''
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
                      toggleEpicExpansionUnassigned(epic.id);
                    }}
                  >
                    {expandedEpicsUnassigned.has(epic.id) ? (
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
                  {expandedEpicsUnassigned.has(epic.id) && epic.children && (
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
                              // Only start drag on left mouse button
                              if (e.button !== 0) return;

                              console.log(`🔽 POINTER DOWN: Starting immediate drag for epic child "${child.title}"`);
                              // Start drag immediately - simple and clean
                              setDraggedItem(child.id);
                              setDragStart({
                                x: e.clientX,
                                y: e.clientY,
                                itemId: child.id
                              });
                              setHideDropZones(false);
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

                                  // Mark that this drop was handled by a specific handler
                                  dropHandledRef.current = true;
                                  
                                  // Clear drag state immediately
                                  setDraggedItem(null);
                                  setDragStart(null);
                                  setHideDropZones(false);

                                  // Assign to sprint
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
                                <span>{child.estimateStoryPoints ?? 'not set'} pts</span>
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
                                {/* Always show Jira status */}
                                <span style={{
                                  color: isCompleted ? '#059669' : '#6b7280',
                                  fontWeight: '500'
                                }}>
                                  {isCompleted ? '✓ ' : ''}{child.jiraStatus || child.status}
                                </span>
                                {isAssigned && !isCompleted && (
                                  <span style={{ color: '#2563eb', fontWeight: '500' }}>
                                    📅 {getSprintName(child.assignedSprints, data.sprints)}
                                  </span>
                                )}
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
        <div className="w-full lg:w-2/3 flex flex-col">
          <h3 className="text-lg font-semibold mb-6">Sprint Assignments</h3>
          <div className="overflow-y-auto flex-1 pr-2 space-y-6">{/* Added independent scrolling for sprints */}

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
                            console.log(`🎯 SPRINT CONTAINER POINTER UP: Dropped "${draggedItem}" in "${sprint.name}"`);
                            addDebugEvent(`🎯 SUCCESS! Dropped item in "${sprint.name}"`);

                            // Mark that this drop was handled by a specific handler
                            dropHandledRef.current = true;
                            console.log(`🏁 Set dropHandledRef to true for sprint container drop`);

                            const itemToAssign = draggedItem;
                            
                            // Clear drag state immediately after capturing draggedItem
                            setDraggedItem(null);
                            setDragStart(null);
                            setHideDropZones(false);

                            // Assign to sprint
                            assignItemToSprint(itemToAssign, sprint.id);
                          }
                        }}
                        className={`bg-white rounded-lg shadow p-6 transition-all duration-200 ${(draggedItem && !hideDropZones)
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

                        <div
                          className="flex justify-between items-start mb-3 cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
                          onClick={(e) => {
                            // Only toggle if not dragging and not clicking on buttons
                            if (!draggedItem && !e.defaultPrevented) {
                              e.stopPropagation();
                              toggleSprintExpansion(sprint.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            {/* Expand/Collapse Icon */}
                            {expandedSprints.has(sprint.id) ? (
                              <ChevronDown className="h-4 w-4 text-blue-600 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-blue-600 flex-shrink-0" />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{sprint.name}</h4>
                                {sprint.status === 'completed' && (
                                  <span className="px-2 py-1 bg-green-100 text-green-600 text-xs rounded-full">
                                    Completed
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">
                                {format(sprint.startDate, 'MMM dd')} - {format(sprint.endDate, 'MMM dd, yyyy')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="text-right">
                              <div className={`font-semibold ${getUtilizationColor(
                                (assignedPoints / sprint.plannedVelocity) * 100
                              )}`}>
                                {((assignedPoints / sprint.plannedVelocity) * 100).toFixed(0)}% utilized
                              </div>
                              <div className="text-sm text-gray-500">
                                {assignedPoints} / {sprint.plannedVelocity} pts
                              </div>
                            </div>
                            {/* Complete Sprint button for active sprints */}
                            {(!sprint.status || sprint.status !== 'completed') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  completeSprint(sprint.id);
                                }}
                                className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-md transition-colors"
                                title={`Mark sprint "${sprint.name}" as completed`}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Collapsible sprint content */}
                        {expandedSprints.has(sprint.id) && (
                          <div className="space-y-3 transition-all duration-200">
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
                                <div className="space-y-2">
                                  {(() => {
                                    // Group items by their epic, even if epic is not in sprint
                                    const epicGroups: Record<string, WorkItem[]> = {};
                                    const standalone: WorkItem[] = [];
                                    
                                    assignedItems.forEach(item => {
                                      if (item.epicId) {
                                        if (!epicGroups[item.epicId]) {
                                          epicGroups[item.epicId] = [];
                                        }
                                        epicGroups[item.epicId].push(item);
                                      } else {
                                        standalone.push(item);
                                      }
                                    });

                                    return (
                                      <div className="space-y-2">
                                        {/* Epic groups */}
                                        {Object.entries(epicGroups).map(([epicId, items]) => {
                                          const epic = data.workItems.find(wi => wi.id === epicId && wi.isEpic);
                                          const epicTitle = epic ? epic.title : `Epic ${epicId}`;
                                          const epicJiraId = epic ? epic.jiraId : null;
                                          const isExpanded = expandedEpicsSprint.has(epicId);
                                          
                                          return (
                                            <div key={epicId} className="border rounded-lg bg-indigo-50 border-indigo-200">
                                              <div
                                                className="p-2 cursor-pointer flex items-center gap-2 hover:bg-indigo-100 transition-colors"
                                                onClick={() => toggleEpicExpansionSprint(epicId)}
                                              >
                                                {isExpanded ? (
                                                  <ChevronDown className="h-4 w-4 text-indigo-600" />
                                                ) : (
                                                  <ChevronRight className="h-4 w-4 text-indigo-600" />
                                                )}
                                                <div className="flex-1">
                                                  <div className="font-medium text-sm text-indigo-800 flex items-center gap-2">
                                                    {epicJiraId ? (
                                                      <span>
                                                        <a
                                                          href={`https://cvs-hcd.atlassian.net/browse/${epicJiraId}`}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                                                          onClick={(e) => e.stopPropagation()}
                                                        >
                                                          {epicJiraId}
                                                          <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                        <span className="ml-1">- {epicTitle}</span>
                                                      </span>
                                                    ) : (
                                                      <span>{epicTitle}</span>
                                                    )}
                                                    <span className="text-xs text-indigo-600">
                                                      {items.length} {items.length === 1 ? 'item' : 'items'}
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>
                                              
                                              {/* Epic children */}
                                              {isExpanded && (
                                                <div className="border-t border-indigo-200 p-2 space-y-1">
                                                  {items.map(child => (
                                                    <div key={child.id} className="flex justify-between items-center p-2 bg-white border-l-2 border-indigo-200 ml-4 rounded text-sm">
                                                      <div className="flex items-center gap-2">
                                                        <div>
                                                          {child.jiraId ? (
                                                            <span className="font-medium">
                                                              <a
                                                                href={`https://cvs-hcd.atlassian.net/browse/${child.jiraId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                                                                onClick={(e) => e.stopPropagation()}
                                                              >
                                                                {child.jiraId}
                                                                <ExternalLink className="h-3 w-3" />
                                                              </a>
                                                              <span className="ml-1">- {child.title}</span>
                                                            </span>
                                                          ) : (
                                                            <span className="font-medium">{child.title}</span>
                                                          )}
                                                          <span className="ml-2 text-gray-600">({child.estimateStoryPoints} pts)</span>
                                                          <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${child.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                                              child.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                                                'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {child.status === 'Completed' ? '✓ ' : ''}{child.jiraStatus || child.status}
                                                          </span>
                                                        </div>
                                                      </div>
                                                      <button
                                                        onClick={(e) => {
                                                          console.log(`🗑️ REMOVE CLICKED: ${child.id} from ${sprint.id}`);
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          removeItemFromSprint(child.id, sprint.id);
                                                        }}
                                                        className="text-red-600 hover:bg-red-100 px-2 py-1 rounded text-xs"
                                                      >
                                                        Remove
                                                      </button>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                        
                                        {/* Standalone items */}
                                        {standalone.map(item => (
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
                                        <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${item.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                          item.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                            'bg-gray-100 text-gray-800'
                                          }`}>
                                          {item.status === 'Completed' ? '✓ ' : ''}{item.jiraStatus || item.status}
                                        </span>
                                      </div>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        console.log(`🗑️ REMOVE CLICKED: ${item.id} from ${sprint.id}`);
                                        e.preventDefault();
                                        e.stopPropagation();
                                        removeItemFromSprint(item.id, sprint.id);
                                      }}
                                      className="text-red-600 hover:bg-red-100 px-2 py-1 rounded text-xs"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
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
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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