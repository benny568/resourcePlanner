import React, { useMemo } from 'react';
import { ResourcePlanningData, WorkItem, Sprint } from '../types';
import { Calendar, Clock, Target, AlertTriangle, TrendingUp, Users } from 'lucide-react';
import { format, addDays, differenceInDays, isAfter } from 'date-fns';
import { calculateSprintCapacity } from '../utils/dateUtils';
import { analyzeDescriptionForSkills } from '../utils/skillDetection';

interface DeliveryForecastProps {
  data: ResourcePlanningData;
  targetDeliveryDate?: Date;
  onSetTargetDeliveryDate?: (date: Date | undefined) => void;
}

interface DeliveryPrediction {
  estimatedDeliveryDate: Date;
  canMeetTarget: boolean;
  sprintsRequired: number;
  totalStoryPoints: number;
  frontendPoints: number;
  backendPoints: number;
  frontendCapacity: number;
  backendCapacity: number;
  bottleneckSkill: 'frontend' | 'backend' | null;
  confidenceLevel: 'High' | 'Medium' | 'Low';
}

export const DeliveryForecast: React.FC<DeliveryForecastProps> = ({
  data,
  targetDeliveryDate,
  onSetTargetDeliveryDate
}) => {
  const prediction = useMemo((): DeliveryPrediction => {
    // Calculate team capacities
    const frontendMembers = data.teamMembers.filter(m => m.skills.includes('frontend'));
    const backendMembers = data.teamMembers.filter(m => m.skills.includes('backend'));
    
    const avgFrontendCapacity = frontendMembers.length > 0 
      ? frontendMembers.reduce((sum, m) => sum + m.capacity, 0) / 100 * frontendMembers.length
      : 0;
    const avgBackendCapacity = backendMembers.length > 0 
      ? backendMembers.reduce((sum, m) => sum + m.capacity, 0) / 100 * backendMembers.length  
      : 0;

    // Calculate per-sprint capacity (assuming standard velocity per person per sprint)
    const baseVelocityPerPerson = data.sprintConfig.defaultVelocity / Math.max(data.teamMembers.length, 1);
    const frontendCapacityPerSprint = avgFrontendCapacity * baseVelocityPerPerson;
    const backendCapacityPerSprint = avgBackendCapacity * baseVelocityPerPerson;

    // Categorize remaining work items by skill requirement
    const uncompletedItems = data.workItems.filter(item => item.status !== 'Completed');
    let frontendPoints = 0;
    let backendPoints = 0;

    uncompletedItems.forEach(item => {
      if (item.requiredSkills.includes('frontend') && item.requiredSkills.includes('backend')) {
        // Split between both
        frontendPoints += item.estimateStoryPoints / 2;
        backendPoints += item.estimateStoryPoints / 2;
      } else if (item.requiredSkills.includes('frontend')) {
        frontendPoints += item.estimateStoryPoints;
      } else if (item.requiredSkills.includes('backend')) {
        backendPoints += item.estimateStoryPoints;
      } else {
        // Use enhanced skill analysis for items with no skills specified
        const analysis = analyzeDescriptionForSkills(item.title || '', item.description || '');
        
        if (analysis.confidence === 'high' && analysis.detectedSkill === 'frontend') {
          frontendPoints += item.estimateStoryPoints;
        } else if (analysis.confidence === 'high' && analysis.detectedSkill === 'backend') {
          backendPoints += item.estimateStoryPoints;
        } else if (analysis.confidence === 'medium' && analysis.detectedSkill === 'frontend') {
          frontendPoints += item.estimateStoryPoints;
        } else if (analysis.confidence === 'medium' && analysis.detectedSkill === 'backend') {
          backendPoints += item.estimateStoryPoints;
        } else {
          // Fallback to simple keyword detection
          const description = item.description?.toLowerCase() || '';
          const title = item.title?.toLowerCase() || '';
          const text = `${title} ${description}`;
          
          if (text.includes('fe') || text.includes('frontend') || text.includes('ui')) {
            frontendPoints += item.estimateStoryPoints;
          } else if (text.includes('be') || text.includes('backend') || text.includes('api')) {
            backendPoints += item.estimateStoryPoints;
          } else {
            // Default split if unclear
            frontendPoints += item.estimateStoryPoints / 2;
            backendPoints += item.estimateStoryPoints / 2;
          }
        }
      }
    });

    // Calculate sprints required for each skill
    const frontendSprintsRequired = frontendCapacityPerSprint > 0 
      ? Math.ceil(frontendPoints / frontendCapacityPerSprint) 
      : 0;
    const backendSprintsRequired = backendCapacityPerSprint > 0 
      ? Math.ceil(backendPoints / backendCapacityPerSprint) 
      : 0;

    const sprintsRequired = Math.max(frontendSprintsRequired, backendSprintsRequired);
    const bottleneckSkill = frontendSprintsRequired > backendSprintsRequired ? 'frontend' : 
                           backendSprintsRequired > frontendSprintsRequired ? 'backend' : null;

    // Calculate estimated delivery date
    const today = new Date();
    const currentOrNextSprint = data.sprints.find(sprint => isAfter(sprint.endDate, today)) || 
                               data.sprints[data.sprints.length - 1];
    
    let estimatedDeliveryDate: Date;
    if (currentOrNextSprint && sprintsRequired > 0) {
      const sprintDuration = data.sprintConfig.sprintDurationDays;
      const additionalDays = (sprintsRequired - 1) * sprintDuration;
      estimatedDeliveryDate = addDays(currentOrNextSprint.endDate, additionalDays);
    } else {
      estimatedDeliveryDate = today;
    }

    // Determine confidence level
    let confidenceLevel: 'High' | 'Medium' | 'Low' = 'High';
    if (sprintsRequired > 6) confidenceLevel = 'Low';
    else if (sprintsRequired > 3) confidenceLevel = 'Medium';

    return {
      estimatedDeliveryDate,
      canMeetTarget: targetDeliveryDate ? estimatedDeliveryDate <= targetDeliveryDate : true,
      sprintsRequired,
      totalStoryPoints: frontendPoints + backendPoints,
      frontendPoints,
      backendPoints,
      frontendCapacity: frontendCapacityPerSprint,
      backendCapacity: backendCapacityPerSprint,
      bottleneckSkill,
      confidenceLevel
    };
  }, [data, targetDeliveryDate]);

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'High': return 'text-green-600 bg-green-100';
      case 'Medium': return 'text-yellow-600 bg-yellow-100';
      case 'Low': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getTargetStatusColor = (canMeet: boolean) => {
    return canMeet ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
  };

  return (
    <div className="space-y-6">
      {/* Target Date Input */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <Calendar className="mr-2" />
          Set Target Delivery Date
        </h2>
        <div className="max-w-md">
          <label htmlFor="target-date" className="block text-sm font-medium text-gray-700 mb-2">
            Target Delivery Date (Optional)
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              id="target-date"
              value={targetDeliveryDate ? format(targetDeliveryDate, 'yyyy-MM-dd') : ''}
              onChange={(e) => {
                if (onSetTargetDeliveryDate) {
                  const newDate = e.target.value ? new Date(e.target.value) : undefined;
                  onSetTargetDeliveryDate(newDate);
                }
              }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {targetDeliveryDate && onSetTargetDeliveryDate && (
              <button
                onClick={() => onSetTargetDeliveryDate(undefined)}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Set a target date to see if your team can meet the deadline
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <Target className="mr-3" />
          Delivery Forecast
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Estimated Delivery</p>
                <p className="text-lg font-bold text-blue-900">
                  {format(prediction.estimatedDeliveryDate, 'MMM d, yyyy')}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className={`rounded-lg p-4 ${getConfidenceColor(prediction.confidenceLevel)}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Confidence</p>
                <p className="text-lg font-bold">{prediction.confidenceLevel}</p>
              </div>
              <TrendingUp className="h-8 w-8" />
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Sprints Required</p>
                <p className="text-lg font-bold text-purple-900">{prediction.sprintsRequired}</p>
              </div>
              <Clock className="h-8 w-8 text-purple-600" />
            </div>
          </div>

          {targetDeliveryDate && (
            <div className={`rounded-lg p-4 ${getTargetStatusColor(prediction.canMeetTarget)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Target Status</p>
                  <p className="text-lg font-bold">
                    {prediction.canMeetTarget ? 'On Track' : 'At Risk'}
                  </p>
                </div>
                {prediction.canMeetTarget ? (
                  <Target className="h-8 w-8" />
                ) : (
                  <AlertTriangle className="h-8 w-8" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Team Capacity Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <Users className="mr-2" />
              Frontend Team
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Developers:</span>
                <span className="font-medium">
                  {data.teamMembers.filter(m => m.skills.includes('frontend')).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Remaining Points:</span>
                <span className="font-medium">{prediction.frontendPoints.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Capacity/Sprint:</span>
                <span className="font-medium">{prediction.frontendCapacity.toFixed(1)}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <Users className="mr-2" />
              Backend Team
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Developers:</span>
                <span className="font-medium">
                  {data.teamMembers.filter(m => m.skills.includes('backend')).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Remaining Points:</span>
                <span className="font-medium">{prediction.backendPoints.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Capacity/Sprint:</span>
                <span className="font-medium">{prediction.backendCapacity.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottleneck Warning */}
        {prediction.bottleneckSkill && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
              <div>
                <h4 className="text-sm font-medium text-yellow-800">Capacity Bottleneck Detected</h4>
                <p className="text-sm text-yellow-700 mt-1">
                  Your <strong>{prediction.bottleneckSkill}</strong> team is the limiting factor for delivery.
                  Consider reallocating resources or adjusting scope to improve velocity.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Target Date Analysis */}
        {targetDeliveryDate && (
          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Target Date Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Target Date:</span>
                <p className="font-medium">{format(targetDeliveryDate, 'MMM d, yyyy')}</p>
              </div>
              <div>
                <span className="text-gray-600">Days Available:</span>
                <p className="font-medium">
                  {Math.max(0, differenceInDays(targetDeliveryDate, new Date()))} days
                </p>
              </div>
              <div>
                <span className="text-gray-600">Buffer:</span>
                <p className={`font-medium ${prediction.canMeetTarget ? 'text-green-600' : 'text-red-600'}`}>
                  {differenceInDays(targetDeliveryDate, prediction.estimatedDeliveryDate)} days
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 