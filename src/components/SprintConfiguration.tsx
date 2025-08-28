import React, { useState, useMemo } from 'react';
import { SprintConfig, Sprint } from '../types';
import { Settings, Calendar, Zap, Loader, Trash2, AlertTriangle } from 'lucide-react';
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
    defaultVelocity: sprintConfig.defaultVelocity,
    startingQuarterSprintNumber: sprintConfig.startingQuarterSprintNumber || 1
  });
  
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>([]);
  const [confirmationText, setConfirmationText] = useState('');

  const dataTypes = [
    { id: 'teamMembers', label: 'All team members', description: 'Remove all team member data' },
    { id: 'workItems', label: 'Work items and epics', description: 'Remove all work items, epics, and their dependencies' },
    { id: 'sprints', label: 'Sprints and sprint assignments', description: 'Remove all sprints and work item assignments' },
    { id: 'publicHolidays', label: 'Public holidays', description: 'Remove all public holiday data' },
    { id: 'privateHolidays', label: 'Private holidays', description: 'Remove all personal holiday data' },
    { id: 'dependencies', label: 'Dependencies and relationships', description: 'Remove all work item dependencies (included with work items)' }
  ];

  const handleDataTypeToggle = (dataTypeId: string) => {
    setSelectedDataTypes(prev => 
      prev.includes(dataTypeId) 
        ? prev.filter(id => id !== dataTypeId)
        : [...prev, dataTypeId]
    );
  };

  // Deduplicate sprints to prevent display issues (same logic as SprintPlanning)
  const deduplicatedSprints = useMemo(() => {
    const sprintsByName = new Map();
    const deduplicated = sprints.filter(sprint => {
      if (sprintsByName.has(sprint.name)) {
        console.warn(`🗑️ SprintConfig: Removing duplicate sprint: "${sprint.name}" (ID: ${sprint.id})`);
        return false; // Skip this duplicate
      } else {
        sprintsByName.set(sprint.name, sprint);
        return true; // Keep this sprint
      }
    });
    
    if (deduplicated.length !== sprints.length) {
      console.log(`✅ SprintConfig deduplication: ${sprints.length} → ${deduplicated.length} sprints`);
    }
    
    return deduplicated;
  }, [sprints]);

  const handleResetDatabase = async () => {
    if (selectedDataTypes.length === 0) {
      setResetMessage('❌ Please select at least one data type to delete.');
      return;
    }

    setIsResetting(true);
    setResetMessage('');
    setShowResetConfirm(false);
    
    try {
      console.log('🚨 Starting selective database reset...', selectedDataTypes);
      
      const response = await fetch('/api/work-items/selective-reset', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataTypes: selectedDataTypes })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Selective reset failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log('✅ Selective reset successful:', result);
      
      setResetMessage(`✅ Selected data deleted successfully! ${result.data?.summary || ''} Please refresh the page to see the changes.`);
      
      // Reset selections
      setSelectedDataTypes([]);
      setConfirmationText('');
      
      // Refresh the page after a short delay to show the changes
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      console.error('❌ Selective reset failed:', error);
      setResetMessage(`❌ Reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsResetting(false);
    }
  };

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
        defaultVelocity: formData.defaultVelocity,
        startingQuarterSprintNumber: formData.startingQuarterSprintNumber
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
    // Use the original sprints array for updates to maintain all data, but only update the specific sprint
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Starting Quarter Sprint Number
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={formData.startingQuarterSprintNumber}
              onChange={(e) => setFormData({ 
                ...formData, 
                startingQuarterSprintNumber: Number(e.target.value)
              })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g., 3 for Sprint 3"
            />
            <div className="text-xs text-gray-500 mt-1">
              Which sprint number to start from in the quarter
            </div>
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
            <div>• Starting Quarter Sprint Number: {sprintConfig.startingQuarterSprintNumber || 1}</div>
            <div>• First Sprint Starts: {format(sprintConfig.firstSprintStartDate, 'MMM dd, yyyy')}</div>
            <div>• Generated Sprints: {deduplicatedSprints.length}</div>
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
          {deduplicatedSprints.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No sprints generated. Update configuration above to generate sprints.
            </div>
          ) : (
            deduplicatedSprints.map((sprint) => (
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

        {deduplicatedSprints.length > 0 && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">Sprint Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium">Total Sprints:</span>
                <div className="text-lg font-bold text-blue-600">{deduplicatedSprints.length}</div>
              </div>
              <div>
                <span className="font-medium">Average Velocity:</span>
                <div className="text-lg font-bold text-blue-600">
                  {deduplicatedSprints.length > 0 
                    ? Math.round(deduplicatedSprints.reduce((sum, s) => sum + s.plannedVelocity, 0) / deduplicatedSprints.length)
                    : 0}
                </div>
              </div>
              <div>
                <span className="font-medium">Total Capacity:</span>
                <div className="text-lg font-bold text-blue-600">
                  {deduplicatedSprints.reduce((sum, s) => sum + s.plannedVelocity, 0)}
                </div>
              </div>
              <div>
                <span className="font-medium">First Sprint:</span>
                <div className="text-sm font-medium text-blue-600">
                  {deduplicatedSprints.length > 0 ? format(deduplicatedSprints[0].startDate, 'MMM dd') : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Database Reset Section */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-red-700">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </h2>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <h3 className="font-semibold text-red-800 mb-2">Selective Database Reset</h3>
          <p className="text-red-700 text-sm mb-4">
            Choose which data types to permanently delete from the database:
          </p>
          
          <div className="space-y-3 mb-4">
            {dataTypes.map((dataType) => (
              <label key={dataType.id} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDataTypes.includes(dataType.id)}
                  onChange={() => handleDataTypeToggle(dataType.id)}
                  className="mt-1 h-4 w-4 text-red-600 border-red-300 rounded focus:ring-red-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-red-800">{dataType.label}</div>
                  <div className="text-sm text-red-600">{dataType.description}</div>
                </div>
              </label>
            ))}
          </div>
          
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setSelectedDataTypes(dataTypes.map(dt => dt.id))}
              className="text-sm px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => setSelectedDataTypes([])}
              className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Clear All
            </button>
          </div>
          
          <p className="text-red-800 text-sm font-semibold">
            ⚠️ This action cannot be undone! Make sure you have backups if needed.
          </p>
        </div>

        {!showResetConfirm ? (
          <button
            onClick={() => {
              if (selectedDataTypes.length === 0) {
                setResetMessage('❌ Please select at least one data type to delete.');
                return;
              }
              setShowResetConfirm(true);
            }}
            disabled={isResetting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete Selected Data
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 font-semibold mb-2">
                Are you absolutely sure?
              </p>
              <p className="text-yellow-700 text-sm mb-2">
                You are about to permanently delete the following data types:
              </p>
              <ul className="text-yellow-700 text-sm mb-3 ml-4 list-disc">
                {selectedDataTypes.map(id => {
                  const dataType = dataTypes.find(dt => dt.id === id);
                  return <li key={id}>{dataType?.label}</li>;
                })}
              </ul>
              <p className="text-yellow-700 text-sm">
                Type "DELETE SELECTED" to confirm this action:
              </p>
              <input
                type="text"
                placeholder="Type DELETE SELECTED here"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                className="mt-2 w-full px-3 py-2 border border-yellow-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleResetDatabase}
                disabled={confirmationText !== 'DELETE SELECTED' || isResetting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isResetting ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Confirm Delete
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  setConfirmationText('');
                }}
                disabled={isResetting}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {resetMessage && (
          <div className={`mt-4 p-3 rounded-lg ${
            resetMessage.includes('✅') 
              ? 'bg-green-50 border border-green-200 text-green-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {resetMessage}
          </div>
        )}
      </div>
    </div>
  );
}; 