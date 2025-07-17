import React from 'react';
import { ResourcePlanningData } from '../types';
import { Users, Calendar, Clock, AlertTriangle, TrendingUp, Target } from 'lucide-react';
import { format, addDays, isAfter, isBefore } from 'date-fns';

interface DashboardProps {
  data: ResourcePlanningData;
}

export const Dashboard: React.FC<DashboardProps> = ({ data }) => {
  // Calculate key metrics
  const totalTeamMembers = data.teamMembers.length;
  const totalWorkItems = data.workItems.length;
  const completedItems = data.workItems.filter(item => item.status === 'Completed').length;
  const inProgressItems = data.workItems.filter(item => item.status === 'In Progress').length;
  const notStartedItems = data.workItems.filter(item => item.status === 'Not Started').length;
  
  const totalStoryPoints = data.workItems.reduce((sum, item) => sum + item.estimateStoryPoints, 0);
  const completedStoryPoints = data.workItems
    .filter(item => item.status === 'Completed')
    .reduce((sum, item) => sum + item.estimateStoryPoints, 0);
  
  const completionPercentage = totalStoryPoints > 0 ? (completedStoryPoints / totalStoryPoints) * 100 : 0;
  
  // Get current and upcoming sprints
  const today = new Date();
  const currentSprint = data.sprints.find(sprint => 
    sprint.startDate <= today && sprint.endDate >= today
  );
  const upcomingSprints = data.sprints.filter(sprint => 
    sprint.startDate > today
  ).slice(0, 3);
  
  // Get overdue items
  const overdueItems = data.workItems.filter(item => 
    item.requiredCompletionDate < today && item.status !== 'Completed'
  );
  
  // Get items due soon (next 30 days)
  const itemsDueSoon = data.workItems.filter(item => 
    item.requiredCompletionDate >= today && 
    item.requiredCompletionDate <= addDays(today, 30) &&
    item.status !== 'Completed'
  );

  // Calculate team capacity utilization
  const totalTeamCapacity = data.teamMembers.reduce((sum, member) => sum + member.capacity, 0);
  const averageTeamCapacity = totalTeamCapacity / Math.max(data.teamMembers.length, 1);
  
  // Calculate upcoming holidays impact
  const upcomingHolidays = data.publicHolidays.filter(holiday => 
    holiday.date >= today && holiday.date <= addDays(today, 90)
  );

  // Risk assessment
  const risks = [];
  if (overdueItems.length > 0) {
    risks.push({ level: 'high', message: `${overdueItems.length} overdue work items` });
  }
  if (averageTeamCapacity < 80) {
    risks.push({ level: 'medium', message: 'Team capacity below 80%' });
  }
  if (itemsDueSoon.length > 5) {
    risks.push({ level: 'medium', message: `${itemsDueSoon.length} items due in next 30 days` });
  }
  if (upcomingHolidays.length > 2) {
    risks.push({ level: 'low', message: `${upcomingHolidays.length} holidays in next 90 days` });
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Team Members</p>
              <p className="text-2xl font-bold text-gray-900">{totalTeamMembers}</p>
            </div>
            <Users className="h-8 w-8 text-blue-600" />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Avg Capacity: {averageTeamCapacity.toFixed(0)}%
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Work Items</p>
              <p className="text-2xl font-bold text-gray-900">{totalWorkItems}</p>
            </div>
            <Target className="h-8 w-8 text-green-600" />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {totalStoryPoints} total story points
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completion</p>
              <p className="text-2xl font-bold text-gray-900">{completionPercentage.toFixed(0)}%</p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-600" />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {completedStoryPoints} / {totalStoryPoints} points
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Sprints</p>
              <p className="text-2xl font-bold text-gray-900">{currentSprint ? 1 : 0}</p>
            </div>
            <Calendar className="h-8 w-8 text-orange-600" />
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {data.sprints.length} total sprints
          </div>
        </div>
      </div>

      {/* Progress Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Work Items Progress</h3>
          
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm font-medium mb-1">
              <span>Overall Completion</span>
              <span>{completionPercentage.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>

          {/* Status breakdown */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm">Completed</span>
              </div>
              <span className="font-medium">{completedItems}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm">In Progress</span>
              </div>
              <span className="font-medium">{inProgressItems}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                <span className="text-sm">Not Started</span>
              </div>
              <span className="font-medium">{notStartedItems}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Current Sprint</h3>
          
          {currentSprint ? (
            <div>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-medium">{currentSprint.name}</h4>
                  <p className="text-sm text-gray-600">
                    {format(currentSprint.startDate, 'MMM dd')} - {format(currentSprint.endDate, 'MMM dd, yyyy')}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Velocity</div>
                  <div className="font-semibold">{currentSprint.plannedVelocity}</div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Work Items:</span>
                  <span>{currentSprint.workItems.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Days Remaining:</span>
                  <span>{Math.max(0, Math.ceil((currentSprint.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No active sprint</p>
              <p className="text-sm">Set up sprints in Sprint Configuration</p>
            </div>
          )}
        </div>
      </div>

      {/* Alerts and Risks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Risks & Alerts
          </h3>
          
          {risks.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              <div className="text-green-600 mb-2">✓</div>
              <p>No current risks identified</p>
            </div>
          ) : (
            <div className="space-y-3">
              {risks.map((risk, index) => (
                <div key={index} className={`p-3 rounded-lg border ${getRiskColor(risk.level)}`}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">{risk.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            Upcoming Deadlines
          </h3>
          
          {itemsDueSoon.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p>No upcoming deadlines</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {itemsDueSoon.slice(0, 5).map(item => (
                <div key={item.id} className="flex justify-between items-center p-2 border rounded">
                  <div>
                    <div className="font-medium text-sm">{item.title}</div>
                    <div className="text-xs text-gray-500">
                      Due: {format(item.requiredCompletionDate, 'MMM dd, yyyy')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{item.estimateStoryPoints}pts</div>
                    <div className={`text-xs px-2 py-1 rounded ${
                      item.status === 'In Progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {item.status}
                    </div>
                  </div>
                </div>
              ))}
              {itemsDueSoon.length > 5 && (
                <div className="text-center text-sm text-gray-500">
                  +{itemsDueSoon.length - 5} more items
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Sprints */}
      {upcomingSprints.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Upcoming Sprints</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {upcomingSprints.map(sprint => (
              <div key={sprint.id} className="border rounded-lg p-4">
                <h4 className="font-medium">{sprint.name}</h4>
                <p className="text-sm text-gray-600 mb-2">
                  {format(sprint.startDate, 'MMM dd')} - {format(sprint.endDate, 'MMM dd')}
                </p>
                <div className="flex justify-between text-sm">
                  <span>Velocity:</span>
                  <span className="font-medium">{sprint.plannedVelocity}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Items:</span>
                  <span className="font-medium">{sprint.workItems.length}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}; 