import React, { useState } from 'react';
import { Sprint, WorkItem, TeamMember, PublicHoliday, ResourcePlanningData } from '../types';
import { Calendar, ChevronLeft, ChevronRight, Clock, Users, AlertTriangle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay } from 'date-fns';
import { calculateSprintCapacity, isDateInSprint } from '../utils/dateUtils';

interface CalendarViewProps {
  data: ResourcePlanningData;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ data }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'sprints'>('month');

  const goToPreviousMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  // Get sprints for current month
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const sprintsInMonth = data.sprints.filter(sprint =>
    (sprint.startDate <= monthEnd && sprint.endDate >= monthStart)
  );

  // Get work items that need to be completed this month or are overdue
  const workItemsForMonth = data.workItems.filter(item =>
    item.requiredCompletionDate >= monthStart && item.requiredCompletionDate <= monthEnd
  );

  const overdueItems = data.workItems.filter(item =>
    item.requiredCompletionDate < monthStart && item.status !== 'Completed'
  );

  // Calculate capacity for each sprint
  const sprintCapacities = sprintsInMonth.map(sprint => ({
    sprint,
    capacity: calculateSprintCapacity(sprint, data.teamMembers, data.publicHolidays),
    workItemsAssigned: data.workItems.filter(item => item.assignedSprints.includes(sprint.id)),
    assignedPoints: data.workItems
      .filter(item => item.assignedSprints.includes(sprint.id))
      .reduce((sum, item) => sum + item.estimateStoryPoints, 0)
  }));

  // Get holidays for current month
  const holidaysInMonth = data.publicHolidays.filter(holiday =>
    holiday.date >= monthStart && holiday.date <= monthEnd
  );

  const renderMonthView = () => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return (
      <div className="grid grid-cols-7 gap-1">
        {/* Header */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="p-2 text-center font-semibold text-gray-600 bg-gray-50">
            {day}
          </div>
        ))}
        
        {/* Calendar days */}
        {days.map(day => {
          const sprintsForDay = sprintsInMonth.filter(sprint => isDateInSprint(day, sprint));
          const holidaysForDay = holidaysInMonth.filter(holiday => isSameDay(holiday.date, day));
          const workItemsForDay = workItemsForMonth.filter(item => 
            isSameDay(item.requiredCompletionDate, day)
          );
          
          return (
            <div key={day.toISOString()} className="border min-h-24 p-1 bg-white hover:bg-gray-50">
              <div className="text-sm font-medium mb-1">
                {format(day, 'd')}
              </div>
              
              {/* Holidays */}
              {holidaysForDay.map(holiday => (
                <div key={holiday.id} className="text-xs bg-red-100 text-red-800 px-1 mb-1 rounded">
                  {holiday.name}
                </div>
              ))}
              
              {/* Sprints */}
              {sprintsForDay.map(sprint => (
                <div key={sprint.id} className="text-xs bg-blue-100 text-blue-800 px-1 mb-1 rounded">
                  {sprint.name}
                </div>
              ))}
              
              {/* Work items due */}
              {workItemsForDay.map(item => (
                <div key={item.id} className="text-xs bg-green-100 text-green-800 px-1 mb-1 rounded">
                  📋 {item.title.substring(0, 15)}...
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  const renderSprintView = () => {
    return (
      <div className="space-y-4">
        {sprintCapacities.map(({ sprint, capacity, workItemsAssigned, assignedPoints }) => {
          const utilizationPercentage = capacity > 0 ? (assignedPoints / capacity) * 100 : 0;
          const isOverAllocated = utilizationPercentage > 100;
          const isUnderAllocated = utilizationPercentage < 70;

          return (
            <div key={sprint.id} className="border rounded-lg p-4 bg-white">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{sprint.name}</h3>
                  <p className="text-sm text-gray-600">
                    {format(sprint.startDate, 'MMM dd')} - {format(sprint.endDate, 'MMM dd, yyyy')}
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${isOverAllocated ? 'text-red-600' : isUnderAllocated ? 'text-yellow-600' : 'text-green-600'}`}>
                    {utilizationPercentage.toFixed(0)}% Capacity
                  </div>
                  <div className="text-xs text-gray-500">
                    {assignedPoints} / {capacity.toFixed(1)} points
                  </div>
                </div>
              </div>

              {/* Capacity bar */}
              <div className="mb-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${isOverAllocated ? 'bg-red-500' : isUnderAllocated ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
                  />
                </div>
              </div>

              {/* Work items */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Assigned Work Items ({workItemsAssigned.length})
                </h4>
                {workItemsAssigned.length === 0 ? (
                  <p className="text-sm text-gray-500">No work items assigned to this sprint</p>
                ) : (
                  workItemsAssigned.map(item => (
                    <div key={item.id} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                      <span>{item.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.estimateStoryPoints}pts</span>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          item.status === 'Completed' ? 'bg-green-100 text-green-800' :
                          item.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Warnings */}
              {(isOverAllocated || isUnderAllocated) && (
                <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${
                  isOverAllocated ? 'bg-red-50 text-red-800' : 'bg-yellow-50 text-yellow-800'
                }`}>
                  <AlertTriangle className="h-4 w-4" />
                  {isOverAllocated ? 
                    'Sprint is over-allocated. Consider moving work to future sprints.' :
                    'Sprint is under-allocated. Consider adding more work items.'
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Resource Calendar
            </h2>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1 rounded text-sm ${
                  viewMode === 'month' ? 'bg-white shadow' : 'text-gray-600'
                }`}
              >
                Month View
              </button>
              <button
                onClick={() => setViewMode('sprints')}
                className={`px-3 py-1 rounded text-sm ${
                  viewMode === 'sprints' ? 'bg-white shadow' : 'text-gray-600'
                }`}
              >
                Sprint View
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={goToPreviousMonth}
              className="p-2 hover:bg-gray-100 rounded"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-lg font-semibold min-w-48 text-center">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <button
              onClick={goToNextMonth}
              className="p-2 hover:bg-gray-100 rounded"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Month stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="text-sm text-gray-600">Sprints This Month</div>
            <div className="text-xl font-bold text-blue-600">{sprintsInMonth.length}</div>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <div className="text-sm text-gray-600">Items Due</div>
            <div className="text-xl font-bold text-green-600">{workItemsForMonth.length}</div>
          </div>
          <div className="bg-red-50 p-3 rounded-lg">
            <div className="text-sm text-gray-600">Overdue Items</div>
            <div className="text-xl font-bold text-red-600">{overdueItems.length}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="text-sm text-gray-600">Holidays</div>
            <div className="text-xl font-bold text-gray-600">{holidaysInMonth.length}</div>
          </div>
        </div>

        {/* View content */}
        {viewMode === 'month' ? renderMonthView() : renderSprintView()}
      </div>

      {/* Overdue items warning */}
      {overdueItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Overdue Work Items ({overdueItems.length})
          </h3>
          <div className="space-y-2">
            {overdueItems.map(item => (
              <div key={item.id} className="flex justify-between items-center text-sm">
                <span>{item.title}</span>
                <div className="flex items-center gap-2 text-red-600">
                  <span>Due: {format(item.requiredCompletionDate, 'MMM dd, yyyy')}</span>
                  <span className="font-medium">{item.estimateStoryPoints}pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}; 