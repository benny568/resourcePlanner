import React from 'react';
import { ResourcePlanningData } from '../types';
import { Users, Calendar, Clock, AlertTriangle, TrendingUp, Target, Zap, BarChart } from 'lucide-react';
import { format, addDays, isAfter, isBefore } from 'date-fns';

interface DashboardProps {
  data: ResourcePlanningData;
}

export const Dashboard: React.FC<DashboardProps> = ({ data }) => {
  // Calculate key metrics
  const totalTeamMembers = data.teamMembers.length;
  const frontendMembers = data.teamMembers.filter(m => m.skills.includes('frontend')).length;
  const backendMembers = data.teamMembers.filter(m => m.skills.includes('backend')).length;
  const fullStackMembers = data.teamMembers.filter(m => 
    m.skills.includes('frontend') && m.skills.includes('backend')
  ).length;

  const totalWorkItems = data.workItems.length;
  const completedItems = data.workItems.filter(item => item.status === 'Completed').length;
  const inProgressItems = data.workItems.filter(item => item.status === 'In Progress').length;
  const notStartedItems = data.workItems.filter(item => item.status === 'Not Started').length;
  
  const totalStoryPoints = data.workItems.reduce((sum, item) => sum + item.estimateStoryPoints, 0);
  const completedStoryPoints = data.workItems
    .filter(item => item.status === 'Completed')
    .reduce((sum, item) => sum + item.estimateStoryPoints, 0);
  const remainingStoryPoints = totalStoryPoints - completedStoryPoints;
  
  const completionPercentage = totalStoryPoints > 0 ? (completedStoryPoints / totalStoryPoints) * 100 : 0;
  
  // Calculate team velocity (from completed sprints)
  const completedSprints = data.sprints.filter(sprint => sprint.actualVelocity !== undefined);
  const averageVelocity = completedSprints.length > 0 
    ? completedSprints.reduce((sum, sprint) => sum + (sprint.actualVelocity || 0), 0) / completedSprints.length
    : data.sprintConfig.defaultVelocity;

  // Estimate remaining sprints needed
  const sprintsRemaining = averageVelocity > 0 ? Math.ceil(remainingStoryPoints / averageVelocity) : 0;

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
  
  // Estimate delivery timeline
  const estimatedDeliveryDate = sprintsRemaining > 0 && currentSprint
    ? addDays(currentSprint.endDate, (sprintsRemaining - 1) * data.sprintConfig.sprintDurationDays)
    : today;

  return (
    <div className="space-y-6">
      {/* Key Delivery Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Est. Delivery Date</p>
              <p className="text-2xl font-bold text-blue-600">
                {sprintsRemaining > 0 ? format(estimatedDeliveryDate, 'MMM d') : 'Done'}
              </p>
              <p className="text-xs text-gray-500">
                {sprintsRemaining} sprints remaining
              </p>
            </div>
            <Calendar className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Team Velocity</p>
              <p className="text-2xl font-bold text-green-600">
                {averageVelocity.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">points per sprint</p>
            </div>
            <Zap className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Progress</p>
              <p className="text-2xl font-bold text-purple-600">
                {completionPercentage.toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500">
                {completedStoryPoints}/{totalStoryPoints} points
              </p>
            </div>
            <BarChart className="h-8 w-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Team Capacity</p>
              <p className="text-2xl font-bold text-orange-600">
                {averageTeamCapacity.toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500">
                {totalTeamMembers} developers
              </p>
            </div>
            <Users className="h-8 w-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Team Composition */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <Users className="mr-2" />
          Team Composition
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{totalTeamMembers}</p>
            <p className="text-sm text-gray-600">Total Developers</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{frontendMembers}</p>
            <p className="text-sm text-gray-600">Frontend</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">{backendMembers}</p>
            <p className="text-sm text-gray-600">Backend</p>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <p className="text-2xl font-bold text-orange-600">{fullStackMembers}</p>
            <p className="text-sm text-gray-600">Full Stack</p>
          </div>
        </div>
      </div>

      {/* Work Items Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <Target className="mr-2" />
            Work Items Status
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Completed</span>
              <div className="flex items-center">
                <span className="font-medium text-green-600 mr-2">{completedItems}</span>
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full" 
                    style={{width: `${(completedItems / totalWorkItems) * 100}%`}}
                  ></div>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">In Progress</span>
              <div className="flex items-center">
                <span className="font-medium text-yellow-600 mr-2">{inProgressItems}</span>
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-yellow-600 h-2 rounded-full" 
                    style={{width: `${(inProgressItems / totalWorkItems) * 100}%`}}
                  ></div>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Not Started</span>
              <div className="flex items-center">
                <span className="font-medium text-gray-600 mr-2">{notStartedItems}</span>
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gray-600 h-2 rounded-full" 
                    style={{width: `${(notStartedItems / totalWorkItems) * 100}%`}}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Risk Indicators */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <AlertTriangle className="mr-2" />
            Delivery Risks
          </h2>
          <div className="space-y-3">
            {overdueItems.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div className="flex items-center">
                  <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                  <span className="text-red-800 font-medium">Overdue Items</span>
                </div>
                <span className="text-red-600 font-bold">{overdueItems.length}</span>
              </div>
            )}
            {itemsDueSoon.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div className="flex items-center">
                  <Clock className="h-5 w-5 text-yellow-600 mr-2" />
                  <span className="text-yellow-800 font-medium">Due Soon (30 days)</span>
                </div>
                <span className="text-yellow-600 font-bold">{itemsDueSoon.length}</span>
              </div>
            )}
            {averageTeamCapacity < 80 && (
              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                <div className="flex items-center">
                  <Users className="h-5 w-5 text-orange-600 mr-2" />
                  <span className="text-orange-800 font-medium">Low Team Capacity</span>
                </div>
                <span className="text-orange-600 font-bold">{averageTeamCapacity.toFixed(0)}%</span>
              </div>
            )}
            {overdueItems.length === 0 && itemsDueSoon.length === 0 && averageTeamCapacity >= 80 && (
              <div className="flex items-center justify-center p-3 bg-green-50 rounded-lg">
                <div className="flex items-center">
                  <Target className="h-5 w-5 text-green-600 mr-2" />
                  <span className="text-green-800 font-medium">No Major Risks Identified</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Current Sprint Status */}
      {currentSprint && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="mr-2" />
            Current Sprint: {currentSprint.name}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Sprint Period</p>
              <p className="font-medium">
                {format(currentSprint.startDate, 'MMM d')} - {format(currentSprint.endDate, 'MMM d')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Planned Velocity</p>
              <p className="font-medium">{currentSprint.plannedVelocity} points</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Work Items</p>
              <p className="font-medium">{currentSprint.workItems.length} items assigned</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 