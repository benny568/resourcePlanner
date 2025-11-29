import React, { useState, useMemo } from 'react';
import { WorkItem, Sprint } from '../types';
import { format, startOfQuarter, endOfQuarter } from 'date-fns';
import { ChevronLeft, ChevronRight, Target } from 'lucide-react';

interface EpicRoadmapProps {
  workItems: WorkItem[];
  sprints: Sprint[];
}

interface EpicData {
  epic: WorkItem;
  children: WorkItem[];
  completedPoints: number;
  totalPoints: number;
  progressPercentage: number;
  earliestSprintStart?: Date;
  latestSprintEnd?: Date;
  sprints: Sprint[];
  completionSprint?: Sprint;
}

export const EpicRoadmap: React.FC<EpicRoadmapProps> = ({ workItems, sprints }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'quarters' | 'sprints'>('sprints');
  const [selectedEpics, setSelectedEpics] = useState<Set<string>>(new Set());
  
  // Get all epic work items and their data
  const epicData = useMemo(() => {
    const epics = workItems.filter(item => item.isEpic);
    
    return epics.map(epic => {
      // Get all children for this epic
      const children = workItems.filter(item => item.epicId === epic.id);
      
      // Calculate completed points
      const completedChildren = children.filter(child => child.status === 'Completed');
      const completedPoints = completedChildren.reduce((sum, child) => sum + (child.estimateStoryPoints || 0), 0);
      const totalPoints = children.reduce((sum, child) => sum + (child.estimateStoryPoints || 0), 0);
      const progressPercentage = totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;
      
      // Get sprints that contain work from this epic
      const epicSprintIds = new Set([
        ...epic.assignedSprints,
        ...children.flatMap(child => child.assignedSprints)
      ]);
      
      const epicSprints = sprints.filter(sprint => epicSprintIds.has(sprint.id));
      epicSprints.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      
      // Find earliest and latest sprint dates
      let earliestSprintStart: Date | undefined;
      let latestSprintEnd: Date | undefined;
      let completionSprint: Sprint | undefined;
      
      if (epicSprints.length > 0) {
        earliestSprintStart = epicSprints[0].startDate;
        latestSprintEnd = epicSprints[epicSprints.length - 1].endDate;
        
        // Determine completion sprint based on last sprint with epic work
        if (progressPercentage >= 100) {
          completionSprint = epicSprints[epicSprints.length - 1];
        } else {
          // Predict completion based on remaining work
          const remainingPoints = totalPoints - completedPoints;
          if (remainingPoints > 0 && epicSprints.length > 0) {
            // Find the sprint that would complete the epic
            let runningTotal = completedPoints;
            for (const sprint of epicSprints) {
              const sprintEpicWork = children.filter(child => 
                child.assignedSprints.includes(sprint.id)
              );
              const sprintPoints = sprintEpicWork.reduce((sum, child) => sum + (child.estimateStoryPoints || 0), 0);
              runningTotal += sprintPoints;
              
              if (runningTotal >= totalPoints) {
                completionSprint = sprint;
                break;
              }
            }
          }
        }
      }
      
      const epicDataItem: EpicData = {
        epic,
        children,
        completedPoints,
        totalPoints,
        progressPercentage,
        earliestSprintStart,
        latestSprintEnd,
        sprints: epicSprints,
        completionSprint
      };
      
      return epicDataItem;
    });
  }, [workItems, sprints]);

  // Filter epics based on selection
  const filteredEpics = selectedEpics.size === 0 
    ? epicData 
    : epicData.filter(epic => selectedEpics.has(epic.epic.id));

  // Get visible sprints based on current view
  const visibleSprints = useMemo(() => {
    if (viewMode === 'quarters') {
      const quarterStart = startOfQuarter(currentDate);
      const quarterEnd = endOfQuarter(currentDate);
      return sprints.filter(sprint => 
        sprint.startDate <= quarterEnd && sprint.endDate >= quarterStart
      ).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    } else {
      // Show 6 sprints centered around current date
      const currentSprint = sprints.find(sprint => 
        currentDate >= sprint.startDate && currentDate <= sprint.endDate
      );
      
      if (currentSprint) {
        const currentIndex = sprints.findIndex(s => s.id === currentSprint.id);
        const startIndex = Math.max(0, currentIndex - 2);
        const endIndex = Math.min(sprints.length, startIndex + 6);
        return sprints.slice(startIndex, endIndex);
      }
      
      // Fallback to first 6 sprints
      return sprints.slice(0, 6);
    }
  }, [sprints, currentDate, viewMode]);

  const toggleEpicSelection = (epicId: string) => {
    const newSelection = new Set(selectedEpics);
    if (newSelection.has(epicId)) {
      newSelection.delete(epicId);
    } else {
      newSelection.add(epicId);
    }
    setSelectedEpics(newSelection);
  };

  const selectAllEpics = () => {
    setSelectedEpics(new Set(epicData.map(epic => epic.epic.id)));
  };

  const clearSelection = () => {
    setSelectedEpics(new Set());
  };

  const navigatePrevious = () => {
    if (viewMode === 'quarters') {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 3, prev.getDate()));
    } else {
      // Find previous sprint period
      const currentSprintIndex = sprints.findIndex(sprint => 
        currentDate >= sprint.startDate && currentDate <= sprint.endDate
      );
      if (currentSprintIndex > 0) {
        setCurrentDate(sprints[currentSprintIndex - 1].startDate);
      }
    }
  };

  const navigateNext = () => {
    if (viewMode === 'quarters') {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 3, prev.getDate()));
    } else {
      // Find next sprint period
      const currentSprintIndex = sprints.findIndex(sprint => 
        currentDate >= sprint.startDate && currentDate <= sprint.endDate
      );
      if (currentSprintIndex < sprints.length - 1) {
        setCurrentDate(sprints[currentSprintIndex + 1].startDate);
      }
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-yellow-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getProgressTextColor = (percentage: number) => {
    if (percentage >= 100) return 'text-green-700';
    if (percentage >= 75) return 'text-blue-700';
    if (percentage >= 50) return 'text-yellow-700';
    if (percentage >= 25) return 'text-orange-700';
    return 'text-red-700';
  };

  const renderEpicRow = (epicDataItem: EpicData) => {
    const { epic, children, completedPoints, totalPoints, progressPercentage, completionSprint } = epicDataItem;
    
    return (
      <div key={epic.id} className="border-b border-gray-200 hover:bg-gray-50">
        <div className="flex items-center">
          {/* Epic Info Column */}
          <div className="w-80 p-4 border-r border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={selectedEpics.has(epic.id)}
                onChange={() => toggleEpicSelection(epic.id)}
                className="rounded"
              />
              {epic.jiraId ? (
                <a 
                  href={`https://cvs-hcd.atlassian.net/browse/${epic.jiraId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm"
                >
                  {epic.jiraId}
                </a>
              ) : (
                <span className="font-medium text-sm text-gray-700">{epic.id}</span>
              )}
            </div>
            
            <h3 className="font-medium text-sm text-gray-900 mb-1 line-clamp-2">
              {epic.title}
            </h3>
            
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <span>{children.length} tickets</span>
              <span>•</span>
              <span>{totalPoints} pts</span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(progressPercentage)}`}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            
            <div className="flex justify-between items-center text-xs">
              <span className={`font-medium ${getProgressTextColor(progressPercentage)}`}>
                {Math.round(progressPercentage)}%
              </span>
              <span className="text-gray-500">
                {completedPoints}/{totalPoints} pts
              </span>
            </div>
          </div>
          
          {/* Sprint Timeline */}
          <div className="flex-1 flex">
            {visibleSprints.map((sprint) => {
              const hasEpicWork = epicDataItem.sprints.some(s => s.id === sprint.id);
              const isCompletionSprint = completionSprint?.id === sprint.id;
              
              return (
                <div 
                  key={sprint.id} 
                  className="flex-1 min-w-0 p-4 border-r border-gray-100 text-center relative"
                >
                  {hasEpicWork && (
                    <div 
                      className={`mx-auto w-full h-6 rounded flex items-center justify-center text-xs font-medium text-white ${
                        isCompletionSprint && progressPercentage >= 100
                          ? 'bg-green-600'
                          : isCompletionSprint
                          ? 'bg-blue-600'
                          : 'bg-gray-400'
                      }`}
                    >
                      {isCompletionSprint && (
                        <span>
                          {progressPercentage >= 100 ? '✅' : '🎯'}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Show completion indicator */}
                  {isCompletionSprint && (
                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 text-xs font-medium text-gray-700">
                      {progressPercentage >= 100 ? 'Done' : 'Target'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-600" />
            Epic Roadmap
          </h2>
          
          <div className="flex items-center gap-4">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <label htmlFor="view-mode-select" className="text-sm font-medium">View:</label>
              <select 
                id="view-mode-select"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as 'quarters' | 'sprints')}
                className="px-3 py-1 border rounded text-sm"
              >
                <option value="sprints">Sprints</option>
                <option value="quarters">Quarters</option>
              </select>
            </div>
            
            {/* Epic Filter */}
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllEpics}
                className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={navigatePrevious}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          
          <div className="text-center">
            <h3 className="text-lg font-medium">
              {viewMode === 'quarters' 
                ? `Q${Math.ceil((currentDate.getMonth() + 1) / 3)} ${currentDate.getFullYear()}`
                : `Sprint View - ${format(currentDate, 'MMM yyyy')}`
              }
            </h3>
          </div>
          
          <button
            onClick={navigateNext}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{epicData.length}</div>
            <div className="text-sm text-blue-700">Total Epics</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {epicData.filter(e => e.progressPercentage >= 100).length}
            </div>
            <div className="text-sm text-green-700">Completed</div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {epicData.filter(e => e.progressPercentage > 0 && e.progressPercentage < 100).length}
            </div>
            <div className="text-sm text-yellow-700">In Progress</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-gray-600">
              {epicData.filter(e => e.progressPercentage === 0).length}
            </div>
            <div className="text-sm text-gray-700">Not Started</div>
          </div>
        </div>
      </div>

      {/* Roadmap Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Table Header */}
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="flex items-center">
            {/* Epic Header */}
            <div className="w-80 p-4 border-r border-gray-200">
              <h3 className="font-medium text-gray-900">Epic</h3>
            </div>
            
            {/* Sprint Headers */}
            <div className="flex-1 flex">
              {visibleSprints.map((sprint) => (
                <div key={sprint.id} className="flex-1 min-w-0 p-4 border-r border-gray-100 text-center">
                  <div className="font-medium text-sm text-gray-900">
                    {sprint.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {format(sprint.startDate, 'MMM dd')} - {format(sprint.endDate, 'MMM dd')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Epic Rows */}
        <div className="max-h-96 overflow-y-auto">
          {filteredEpics.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {epicData.length === 0 
                ? "No epics found. Import epics from Jira or create epic work items."
                : "No epics selected. Use the filters above to select epics to display."
              }
            </div>
          ) : (
            filteredEpics.map(renderEpicRow)
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-medium text-gray-900 mb-3">Legend</h3>
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-600 rounded"></div>
            <span>Completion Sprint (Done)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-600 rounded"></div>
            <span>Target Completion Sprint</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-400 rounded"></div>
            <span>Epic Work in Sprint</span>
          </div>
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>Epic Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🎯</span>
            <span>Target Completion</span>
          </div>
        </div>
      </div>
    </div>
  );
};
