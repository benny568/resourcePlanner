import React, { useState } from 'react';
import { SprintConfig, Sprint } from '../types';
import { Settings, Calendar, Zap, Loader } from 'lucide-react';
import { format } from 'date-fns';
import { generateSprintsForYear, formatDateRange } from '../utils/dateUtils';

interface SprintConfigurationProps {
  sprintConfig: SprintConfig;
  sprints: Sprint[];
  onUpdateSprintConfig: (config: SprintConfig) => void;
  onUpdateSprints: (sprints: Sprint[], useBatchOperation?: boolean, isRegeneration?: boolean) => void;
}

export const SprintConfiguration: React.FC<SprintConfigurationProps> = ({
  sprintConfig,
  sprints,
  onUpdateSprintConfig,
  onUpdateSprints
}) => {
  const [formData, setFormData] = useState({
    firstSprintStartDate: format(sprintConfig.firstSprintStartDate, 'yyyy-MM-dd'),
    sprintDurationDays: sprintConfig.sprintDurationDays,
    defaultVelocity: sprintConfig.defaultVelocity
  });
  
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');

  const handleConfigUpdate = async () => {
    // Prevent multiple simultaneous updates
    if (isUpdating) {
      console.log('⚠️ Configuration update already in progress, ignoring click');
      return;
    }
    
    setIsUpdating(true);
    setUpdateMessage('');
    
    try {
      const newConfig: SprintConfig = {
        firstSprintStartDate: new Date(formData.firstSprintStartDate),
        sprintDurationDays: formData.sprintDurationDays,
        defaultVelocity: formData.defaultVelocity
      };

      await onUpdateSprintConfig(newConfig);
      
      // Regenerate sprints for current year
      const currentYear = new Date().getFullYear();
      const newSprints = generateSprintsForYear(newConfig, currentYear);
      await onUpdateSprints(newSprints, true, true); // Use batch operation for bulk sprint regeneration with isRegeneration=true
      
      setUpdateMessage('✅ Configuration and sprints updated successfully!');
      setTimeout(() => setUpdateMessage(''), 3000);
    } catch (error) {
      console.error('Error updating configuration:', error);
      // Check if it's a regeneration conflict
      if (error && typeof error === 'object' && 'message' in error && 
          typeof error.message === 'string' && error.message.includes('regeneration is already in progress')) {
        setUpdateMessage('⚠️ Sprint regeneration is already in progress. Please wait...');
      } else {
        setUpdateMessage('❌ Failed to update configuration. Please try again.');
      }
      setTimeout(() => setUpdateMessage(''), 5000);
    } finally {
      setIsUpdating(false);
    }
  };

  const updateSprintVelocity = async (sprintId: string, velocity: number) => {
    const updatedSprints = sprints.map(sprint =>
      sprint.id === sprintId ? { ...sprint, plannedVelocity: velocity } : sprint
    );
    await onUpdateSprints(updatedSprints); // Single sprint update, use individual operation
  };

  const generateSprintsForNextYear = () => {
    const nextYear = new Date().getFullYear() + 1;
    const nextYearSprints = generateSprintsForYear(sprintConfig, nextYear);
    onUpdateSprints([...sprints, ...nextYearSprints], true, false); // Use batch operation for bulk sprint generation (not regeneration)
  };

  return (
    <div className="space-y-6">
      {/* Sprint Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Sprint Configuration
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              First Sprint Start Date
            </label>
            <input
              type="date"
              value={formData.firstSprintStartDate}
              onChange={(e) => setFormData({ 
                ...formData, 
                firstSprintStartDate: e.target.value 
              })}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Sprint Duration (Days)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              value={formData.sprintDurationDays}
              onChange={(e) => setFormData({ 
                ...formData, 
                sprintDurationDays: Number(e.target.value)
              })}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Default Velocity (Story Points)
            </label>
            <input
              type="number"
              min="1"
              value={formData.defaultVelocity}
              onChange={(e) => setFormData({ 
                ...formData, 
                defaultVelocity: Number(e.target.value)
              })}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
        </div>

        <button
          onClick={handleConfigUpdate}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
          disabled={isUpdating}
        >
          {isUpdating ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <Settings className="h-4 w-4" />
          )}
          {isUpdating ? 'Updating...' : 'Update Configuration & Regenerate Sprints'}
        </button>

        {updateMessage && (
          <div className={`mt-4 p-3 rounded-md text-center ${
            updateMessage.startsWith('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {updateMessage}
          </div>
        )}

        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium mb-2">Configuration Summary</h3>
          <div className="text-sm space-y-1">
            <div>• Sprint Duration: {sprintConfig.sprintDurationDays} days</div>
            <div>• Default Velocity: {sprintConfig.defaultVelocity} story points per sprint</div>
            <div>• First Sprint Starts: {format(sprintConfig.firstSprintStartDate, 'MMM dd, yyyy')}</div>
            <div>• Generated Sprints: {sprints.length}</div>
          </div>
        </div>
      </div>

      {/* Generated Sprints */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Generated Sprints ({new Date().getFullYear()})
          </h2>
          <button
            onClick={generateSprintsForNextYear}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm"
          >
            Generate Next Year Sprints
          </button>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {sprints.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No sprints generated. Update configuration above to generate sprints.
            </div>
          ) : (
            sprints.map((sprint) => (
              <div key={sprint.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold">{sprint.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {formatDateRange(sprint.startDate, sprint.endDate)}
                    </p>
                    <div className="text-sm text-gray-500 mt-1">
                      Work Items: {sprint.workItems.length}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 ml-4">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <label className="text-sm font-medium">Velocity:</label>
                      <input
                        type="number"
                        min="1"
                        value={sprint.plannedVelocity}
                        onChange={(e) => updateSprintVelocity(sprint.id, Number(e.target.value))}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {sprints.length > 0 && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">Sprint Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium">Total Sprints:</span>
                <div className="text-lg font-bold text-blue-600">{sprints.length}</div>
              </div>
              <div>
                <span className="font-medium">Average Velocity:</span>
                <div className="text-lg font-bold text-blue-600">
                  {sprints.length > 0 
                    ? Math.round(sprints.reduce((sum, s) => sum + s.plannedVelocity, 0) / sprints.length)
                    : 0}
                </div>
              </div>
              <div>
                <span className="font-medium">Total Capacity:</span>
                <div className="text-lg font-bold text-blue-600">
                  {sprints.reduce((sum, s) => sum + s.plannedVelocity, 0)}
                </div>
              </div>
              <div>
                <span className="font-medium">First Sprint:</span>
                <div className="text-sm font-medium text-blue-600">
                  {sprints.length > 0 ? format(sprints[0].startDate, 'MMM dd') : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 