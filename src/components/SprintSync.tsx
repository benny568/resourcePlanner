import React, { useState } from 'react';
import { ResourcePlanningData } from '../types';
import { sprintSyncService, SprintSyncResult, SprintSyncResponse, PastSprintSyncResponse } from '../services/sprintSync';

interface SprintSyncProps {
  data: ResourcePlanningData;
  onSyncComplete: () => void;
}

export const SprintSync: React.FC<SprintSyncProps> = ({ data, onSyncComplete }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [syncResults, setSyncResults] = useState<SprintSyncResponse | null>(null);
  const [pastSyncResults, setPastSyncResults] = useState<PastSprintSyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSprints, setSelectedSprints] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Get sync recommendations
  const recommendations = sprintSyncService.getSyncRecommendations(data);
  
  // Calculate velocity trends from synced results or fall back to existing data
  const getVelocityTrends = () => {
    if (syncResults && syncResults.syncResults.length > 0) {
      // Use fresh Jira data
      const syncedSprints = syncResults.syncResults.filter(r => r.status === 'synced' && r.actualVelocity);
      if (syncedSprints.length > 0) {
        const avgVelocity = syncedSprints.reduce((sum, s) => sum + (s.actualVelocity || 0), 0) / syncedSprints.length;
        return {
          averageVelocity: Math.round(avgVelocity * 10) / 10,
          velocityTrend: 'stable' as const,
          confidenceLevel: syncedSprints.length >= 3 ? 'high' as const : 'medium' as const,
          sprintsWithData: syncedSprints.length
        };
      }
    }
    // Fall back to existing data
    return sprintSyncService.calculateVelocityTrends(data);
  };
  
  const velocityTrends = getVelocityTrends();

  const handleSyncAll = async () => {
    setIsLoading(true);
    setError(null);
    setSyncResults(null);

    try {
      const result = await sprintSyncService.syncAllSprints();
      setSyncResults(result);
      onSyncComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync sprints');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncSelected = async () => {
    if (selectedSprints.length === 0) {
      setError('Please select at least one sprint to sync');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSyncResults(null);

    try {
      const result = await sprintSyncService.syncSpecificSprints(selectedSprints);
      setSyncResults(result);
      onSyncComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync selected sprints');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncPastSprints = async () => {
    setIsLoading(true);
    setError(null);
    setPastSyncResults(null);

    try {
      // Prepare date range if provided
      const dateRangeFilter = (dateRange.start && dateRange.end) ? {
        start: dateRange.start,
        end: dateRange.end
      } : undefined;

      const result = await sprintSyncService.syncPastSprints(dateRangeFilter);
      setPastSyncResults(result);
      onSyncComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync past sprints');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSprintSelection = (sprintName: string) => {
    setSelectedSprints(prev => 
      prev.includes(sprintName) 
        ? prev.filter(name => name !== sprintName)
        : [...prev, sprintName]
    );
  };

  const getStatusIcon = (status: SprintSyncResult['status']) => {
    switch (status) {
      case 'synced': return '✅';
      case 'not_found': return '⚠️';
      case 'error': return '❌';
      default: return '🔄';
    }
  };

  const getStatusColor = (status: SprintSyncResult['status']) => {
    switch (status) {
      case 'synced': return 'text-green-600';
      case 'not_found': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-blue-600';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return '📈';
      case 'declining': return '📉';
      case 'stable': return '📊';
      default: return '📊';
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          📊 Sprint Data Sync
        </h2>
        <p className="text-gray-600">
          Synchronize completed work from Jira to update sprint planning with actual velocity data
        </p>
      </div>

      {/* Velocity Trends Summary */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-3 flex items-center">
          📈 Velocity Trends
          {syncResults && (
            <span className="ml-2 text-sm text-green-600 font-normal">
              (Live data from Jira)
            </span>
          )}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {velocityTrends.averageVelocity}
            </div>
            <div className="text-sm text-gray-600">Avg Velocity</div>
          </div>
          <div className="text-center">
            <div className="text-2xl">
              {getTrendIcon(velocityTrends.velocityTrend)}
            </div>
            <div className="text-sm text-gray-600 capitalize">
              {velocityTrends.velocityTrend}
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {velocityTrends.sprintsWithData}
            </div>
            <div className="text-sm text-gray-600">Sprints w/ Data</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${
              velocityTrends.confidenceLevel === 'high' ? 'text-green-600' :
              velocityTrends.confidenceLevel === 'medium' ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {velocityTrends.confidenceLevel.toUpperCase()}
            </div>
            <div className="text-sm text-gray-600">Confidence</div>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.recommendedSprints.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-blue-800">
            💡 Sync Recommendations
          </h3>
          <p className="text-blue-700 mb-3">{recommendations.reason}</p>
          <div className="flex flex-wrap gap-2">
            {recommendations.recommendedSprints.map(sprintName => (
              <span 
                key={sprintName}
                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
              >
                {sprintName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sync Controls */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-4 mb-4">
          <button
            onClick={handleSyncAll}
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Syncing...
              </>
            ) : (
              '🔄 Sync All Completed Sprints'
            )}
          </button>

          <button
            onClick={handleSyncSelected}
            disabled={isLoading || selectedSprints.length === 0}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🎯 Sync Selected ({selectedSprints.length})
          </button>

          <button
            onClick={handleSyncPastSprints}
            disabled={isLoading}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Syncing...
              </>
            ) : (
              '🎯 Fill Past Sprints from Jira'
            )}
          </button>
        </div>

        {/* Date Range Filter for Past Sprint Sync */}
        <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <h4 className="font-semibold mb-3 text-purple-800">📅 Optional Date Range Filter</h4>
          <p className="text-purple-700 text-sm mb-3">
            Filter completed tickets by date range. Leave empty to sync all completed tickets.
          </p>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            {(dateRange.start || dateRange.end) && (
              <div className="flex items-end">
                <button
                  onClick={() => setDateRange({ start: '', end: '' })}
                  className="px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sprint Selection */}
        {data.sprints.length > 0 && (
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold mb-3">Select Sprints to Sync:</h4>
            <div className="max-h-40 overflow-y-auto">
              {data.sprints.map(sprint => (
                <label 
                  key={sprint.id}
                  className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSprints.includes(sprint.name)}
                    onChange={() => toggleSprintSelection(sprint.name)}
                    className="mr-3"
                  />
                  <div className="flex-1">
                    <div className="font-medium">{sprint.name}</div>
                    <div className="text-sm text-gray-600">
                      {new Date(sprint.startDate).toLocaleDateString()} - {new Date(sprint.endDate).toLocaleDateString()}
                      {sprint.actualVelocity && (
                        <span className="ml-2 text-green-600">
                          ✅ {sprint.actualVelocity} pts actual
                        </span>
                      )}
                      {!sprint.actualVelocity && (
                        <span className="ml-2 text-yellow-600">
                          ⚠️ No actual velocity
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-800 font-semibold">❌ Sync Error</div>
          <div className="text-red-700 mt-1">{error}</div>
        </div>
      )}

      {/* Sync Results */}
      {syncResults && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">🔄 Sync Results</h3>
          
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-green-800 font-semibold">
              {syncResults.message}
            </div>
            <div className="text-green-700 text-sm">
              Completed at: {new Date(syncResults.timestamp).toLocaleString()}
            </div>
          </div>

          <div className="space-y-3">
            {syncResults.syncResults.map((result, index) => (
              <div 
                key={index}
                className={`p-4 border rounded-lg ${
                  result.status === 'synced' ? 'bg-green-50 border-green-200' :
                  result.status === 'not_found' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold flex items-center">
                    <span className="mr-2">{getStatusIcon(result.status)}</span>
                    {result.sprintName}
                  </div>
                  <span className={`text-sm font-medium ${getStatusColor(result.status)}`}>
                    {result.status.toUpperCase()}
                  </span>
                </div>

                {result.status === 'synced' && (
                  <div className="text-sm text-gray-700">
                    <div className="grid grid-cols-2 gap-4 mb-2">
                      <div>
                        <strong>Planned:</strong> {result.plannedVelocity} pts
                      </div>
                      <div>
                        <strong>Actual:</strong> {result.actualVelocity} pts
                      </div>
                    </div>
                    {result.updatedWorkItems && result.updatedWorkItems > 0 && (
                      <div className="mt-2">
                        <strong>Updated {result.updatedWorkItems} work items:</strong>
                        <div className="ml-4 mt-1">
                          {result.workItemUpdates?.map((update, idx) => (
                            <div key={idx} className="text-xs">
                              {update.jiraId}: {update.oldStatus} → {update.newStatus}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {result.status === 'not_found' && (
                  <div className="text-sm text-yellow-700">
                    {result.message}
                  </div>
                )}

                {result.status === 'error' && (
                  <div className="text-sm text-red-700">
                    {result.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Sprint Sync Results */}
      {pastSyncResults && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">🎯 Past Sprint Fill Results</h3>
          
          <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="text-purple-800 font-semibold">
              {pastSyncResults.message}
            </div>
            <div className="text-purple-700 text-sm">
              Completed at: {new Date(pastSyncResults.timestamp).toLocaleString()}
            </div>
            <div className="text-purple-700 text-sm mt-1">
              <strong>Summary:</strong> {pastSyncResults.summary.successfulSyncs} tickets synced, {pastSyncResults.summary.errors} errors, {pastSyncResults.summary.sprintUpdates} sprints updated
            </div>
          </div>

          {/* Sprint Updates */}
          {pastSyncResults.sprintUpdates.length > 0 && (
            <div className="mb-4">
              <h4 className="font-semibold mb-2">📊 Sprint Velocity Updates</h4>
              <div className="space-y-2">
                {pastSyncResults.sprintUpdates.map((update, index) => (
                  <div key={index} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="font-medium">{update.sprintName}</div>
                    <div className="text-sm text-gray-700">
                      Velocity: {update.oldVelocity || 0} → {update.newVelocity} pts 
                      ({update.completedItems} completed items)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ticket Sync Results */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {pastSyncResults.syncResults.map((result, index) => (
              <div 
                key={index}
                className={`p-3 border rounded-lg text-sm ${
                  result.status === 'synced' ? 'bg-green-50 border-green-200' :
                  result.status === 'no_sprint_found' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center">
                    <span className="mr-2">
                      {result.status === 'synced' ? '✅' : 
                       result.status === 'no_sprint_found' ? '⚠️' : '❌'}
                    </span>
                    {result.ticketKey}
                  </div>
                  <span className={`text-xs font-medium ${
                    result.status === 'synced' ? 'text-green-600' :
                    result.status === 'no_sprint_found' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {result.status.toUpperCase().replace('_', ' ')}
                  </span>
                </div>

                {result.status === 'synced' && (
                  <div className="text-xs text-gray-600 mt-1">
                    Sprint: {result.sprintName} | Points: {result.storyPoints}
                  </div>
                )}

                {result.message && (
                  <div className="text-xs text-gray-600 mt-1">
                    {result.message}
                  </div>
                )}

                {result.error && (
                  <div className="text-xs text-red-600 mt-1">
                    Error: {result.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
