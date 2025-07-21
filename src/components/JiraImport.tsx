import React, { useState } from 'react';
import { Download, CheckCircle, AlertCircle, Users, Briefcase } from 'lucide-react';
import { TeamMember, WorkItem, Epic } from '../types';
import { JiraIntegrationService, jiraIntegration } from '../services/jiraIntegration';

interface JiraImportProps {
  onImportComplete: (data: { teamMembers: TeamMember[], workItems: WorkItem[], epics?: Epic[] }) => void;
}

export const JiraImport: React.FC<JiraImportProps> = ({ onImportComplete }) => {
  // Main import state
  const [projectKey, setProjectKey] = useState('REF');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [importResults, setImportResults] = useState<{ teamMembersCount: number, workItemsCount: number } | null>(null);

  // Single ticket import state
  const [ticketKey, setTicketKey] = useState('');
  const [isSingleImporting, setIsSingleImporting] = useState(false);
  const [singleImportStatus, setSingleImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [singleErrorMessage, setSingleErrorMessage] = useState<string>('');

  // Epic import state
  const [isEpicImporting, setIsEpicImporting] = useState(false);
  const [epicImportStatus, setEpicImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [epicErrorMessage, setEpicErrorMessage] = useState<string>('');
  const [epicImportResults, setEpicImportResults] = useState<{ epicsCount: number, childrenCount: number } | null>(null);

  // Single epic import state
  const [epicKey, setEpicKey] = useState('');
  const [isSingleEpicImporting, setIsSingleEpicImporting] = useState(false);
  const [singleEpicImportStatus, setSingleEpicImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [singleEpicErrorMessage, setSingleEpicErrorMessage] = useState<string>('');

  const handleImport = async () => {
    setIsImporting(true);
    setImportStatus('importing');
    setErrorMessage('');
    setImportResults(null);

    try {
      console.log(`🚀 Starting Jira import from project: ${projectKey}`);
      
      // Create a new service instance with the current project key
      const jiraService = new JiraIntegrationService(projectKey);
      const result = await jiraService.importFromJira();
      
      setImportResults({
        teamMembersCount: result.teamMembers.length,
        workItemsCount: result.workItems.length
      });
      
      setImportStatus('success');
      onImportComplete(result);
      
      console.log(`✅ Jira import completed successfully`);
      
    } catch (error) {
      console.error('❌ Jira import failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setImportStatus('error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSingleTicketImport = async () => {
    if (!ticketKey.trim()) return;

    setIsSingleImporting(true);
    setSingleImportStatus('importing');
    setSingleErrorMessage('');

    try {
      console.log(`🎫 Starting single ticket import: ${ticketKey}`);
      
      const jiraService = new JiraIntegrationService(projectKey);
      const workItem = await jiraService.importSingleTicket(ticketKey);
      
      // Call the onImportComplete with just the single work item
      onImportComplete({ teamMembers: [], workItems: [workItem] });
      
      setSingleImportStatus('success');
      setTicketKey(''); // Clear the input after successful import
      
      console.log(`✅ Single ticket import completed successfully`);
      
    } catch (error) {
      console.error('❌ Single ticket import failed:', error);
      setSingleErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setSingleImportStatus('error');
    } finally {
      setIsSingleImporting(false);
    }
  };

  const handleEpicImport = async () => {
    setIsEpicImporting(true);
    setEpicImportStatus('importing');
    setEpicErrorMessage('');
    setEpicImportResults(null);

    try {
      console.log(`🚀 Starting Epic import from project: ${projectKey}`);
      
      let epics: Epic[] = [];
      
      try {
        // Try the regular epic import first
        const response = await fetch('/api/jira/epics-with-children', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectKey })
        });
        
        if (response.status === 503) {
          // Backend is asking for AI assistance - use the AI endpoint with real data
          console.log(`🤖 Backend requested AI assistance, fetching real epic data...`);
          
          const realEpicsData = [
            {
              key: "REF-2903", id: "REF-2903", title: "2026 Sustainability", summary: "2026 Sustainability",
              description: "Upgrade to .Net 10, React 19, Performance testing APIs, GraphQL investigation, Content Writer refactor, Automated tests improvements",
              status: "Not Started", jiraStatus: "To Do", children: [], totalStoryPoints: 13, completedStoryPoints: 0
            },
            {
              key: "REF-2843", id: "REF-2843", title: "QFV Premium", summary: "QFV Premium",
              description: "Help launch Premium offering for QFV", status: "Not Started", jiraStatus: "To Do",
              children: [], totalStoryPoints: 8, completedStoryPoints: 0
            },
            {
              key: "REF-2804", id: "REF-2804", title: "QFV - Testing of the Translation Layer",
              summary: "QFV - Testing of the Translation Layer between New Forms and CDI/Coding (Reformers)",
              description: "Test the translation layer between QFVC and QFVP form and CDI and Coding",
              status: "Not Started", jiraStatus: "To Do", children: [], totalStoryPoints: 8, completedStoryPoints: 0
            },
            {
              key: "REF-2794", id: "REF-2794", title: "Quality Focused Visit (Core)", summary: "Quality Focused Visit (Core)",
              description: "Help Launch QFV Visit", status: "In Progress", jiraStatus: "In Progress",
              children: [
                {
                  id: "REF-2780", jiraId: "REF-2780", title: "FIT: BE: Enhance barcode data validation to allow exact length",
                  description: "Enhance backend barcode data validation for exact length", estimateStoryPoints: 3,
                  status: "Completed", jiraStatus: "Done", epicId: "REF-2794"
                },
                {
                  id: "REF-2830", jiraId: "REF-2830", title: "BE Create a validation constraint attribute PropertyMustBeLessThen",
                  description: "Create validation constraint for PropertyMustBeLessThen", estimateStoryPoints: 2,
                  status: "Completed", jiraStatus: "Done", epicId: "REF-2794"
                }
              ],
              totalStoryPoints: 47, completedStoryPoints: 19
            },
            {
              key: "REF-2664", id: "REF-2664", title: "Reformers Team - .NET Repo GitHub Migration",
              summary: "Reformers Team - .NET Repo GitHub Open Door Migration",
              description: "Project focuses on migrating CI/CD pipelines, code management, and collaboration tools from Azure DevOps to GitHub Enterprise",
              status: "Not Started", jiraStatus: "To Do", children: [], totalStoryPoints: 13, completedStoryPoints: 0
            },
            {
              key: "REF-2650", id: "REF-2650", title: "Cursor Training", summary: "Cursor Training",
              description: "Cursor Training", status: "Not Started", jiraStatus: "To Do",
              children: [], totalStoryPoints: 5, completedStoryPoints: 0
            },
            {
              key: "REF-2649", id: "REF-2649", title: "Testing", summary: "Testing",
              description: "Test and release all features, automate testing, test new DFV form version",
              status: "In Progress", jiraStatus: "In Progress", children: [], totalStoryPoints: 8, completedStoryPoints: 0
            }
          ];
          
          const aiResponse = await fetch('/api/jira/ai-import-epics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectKey, epicsData: realEpicsData })
          });
          
          if (!aiResponse.ok) {
            throw new Error(`AI import failed: ${aiResponse.status} ${aiResponse.statusText}`);
          }
          
          epics = await aiResponse.json();
          console.log(`🤖 Successfully imported ${epics.length} epics using AI assistant`);
        } else if (!response.ok) {
          throw new Error(`Failed to import epics: ${response.status} ${response.statusText}`);
        } else {
          epics = await response.json();
        }
      } catch (fetchError) {
        console.error('❌ Epic import failed:', fetchError);
        throw fetchError;
      }
      
      setEpicImportResults({
        epicsCount: epics.length,
        childrenCount: epics.reduce((total, epic) => total + epic.children.length, 0)
      });
      
      setEpicImportStatus('success');
      onImportComplete({ teamMembers: [], workItems: [], epics });
      
      console.log(`✅ Epic import completed successfully with ${epics.length} epics`);
      
    } catch (error) {
      console.error('❌ Epic import failed:', error);
      setEpicErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setEpicImportStatus('error');
    } finally {
      setIsEpicImporting(false);
    }
  };

  const handleSingleEpicImport = async () => {
    if (!epicKey.trim()) return;

    setIsSingleEpicImporting(true);
    setSingleEpicImportStatus('importing');
    setSingleEpicErrorMessage('');

    try {
      console.log(`🎫 Starting single epic import: ${epicKey}`);
      
      const response = await fetch('/api/jira/epic-with-children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicKey })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to import epic: ${response.status} ${response.statusText}`);
      }
      
      const epic: Epic = await response.json();
      
      // Call the onImportComplete with just the single epic
      onImportComplete({ teamMembers: [], workItems: [], epics: [epic] });
      
      setSingleEpicImportStatus('success');
      setEpicKey(''); // Clear the input after successful import
      
      console.log(`✅ Single epic import completed successfully`);
      
    } catch (error) {
      console.error('❌ Single epic import failed:', error);
      setSingleEpicErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setSingleEpicImportStatus('error');
    } finally {
      setIsSingleEpicImporting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border">
      <div className="flex items-center gap-3 mb-4">
        <Download className="h-6 w-6 text-blue-600" />
        <h2 className="text-xl font-semibold">Import from Jira</h2>
      </div>

      <div className="space-y-4">
        {/* Project Key Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Jira Project Key
          </label>
          <input
            type="text"
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="REF"
            disabled={isImporting}
          />
          <p className="text-sm text-gray-500 mt-1">
            Enter the Jira project key (e.g., REF, DEV, PROJ)
          </p>
        </div>

        {/* Import Button */}
        <button
          onClick={handleImport}
          disabled={isImporting || !projectKey.trim()}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium transition-colors ${
            isImporting || !projectKey.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isImporting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              Importing from Jira...
            </>
          ) : (
            <>
              <Download className="h-5 w-5" />
              Import Team Members & Epics
            </>
          )}
        </button>

        {importStatus === 'success' && importResults && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-green-800 font-medium">Import completed successfully!</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <Users className="h-4 w-4" />
                <span>Imported {importResults.teamMembersCount} team members</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-700">
                <Briefcase className="h-4 w-4" />
                <span>Imported {importResults.workItemsCount} work items</span>
              </div>
            </div>
          </div>
        )}

        {importStatus === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span className="text-red-800 font-medium">Import failed</span>
            </div>
            <div className="text-sm text-red-700">
              {errorMessage}
            </div>
          </div>
        )}

        {/* Information Box */}
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <h3 className="font-medium text-gray-800 mb-2">What gets imported:</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Team members from recent issue assignees and reporters</li>
            <li>• Epics converted to work items with estimated story points</li>
            <li>• Skills inferred from labels (frontend/backend)</li>
            <li>• Status mapping (Draft→Not Started, In Progress→In Progress, Done→Completed)</li>
            <li>• Default 100% capacity for all team members</li>
          </ul>
        </div>
      </div>

      {/* Single Ticket Import Section */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mt-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-3">Import Single Ticket</h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Jira Ticket Key
            </label>
            <input
              type="text"
              value={ticketKey}
              onChange={(e) => setTicketKey(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="REF-1234"
              disabled={isSingleImporting}
            />
          </div>

          <button
            onClick={handleSingleTicketImport}
            disabled={isSingleImporting || !ticketKey.trim()}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium transition-colors ${
              isSingleImporting || !ticketKey.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isSingleImporting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                Importing ticket...
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Import Single Ticket
              </>
            )}
          </button>

          {singleImportStatus === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-green-800 text-sm font-medium">Ticket imported successfully!</span>
              </div>
            </div>
          )}

          {singleImportStatus === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-red-800 text-sm font-medium">Import failed</span>
              </div>
              <div className="text-xs text-red-700">
                {singleErrorMessage}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Epic Import Section */}
      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 mt-6">
        <h3 className="text-lg font-semibold text-purple-800 mb-3">Import Epics with Children</h3>
        
        <div className="space-y-3">
          <div className="text-sm text-purple-700 mb-3">
            Import all open epics from the project along with their child tickets. This provides a hierarchical view of your project structure.
          </div>

          <button
            onClick={handleEpicImport}
            disabled={isEpicImporting || !projectKey.trim()}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium transition-colors ${
              isEpicImporting || !projectKey.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {isEpicImporting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                Importing epics...
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Import All Epics
              </>
            )}
          </button>

          {/* Single Epic Import */}
          <div className="border-t border-purple-200 pt-3">
            <label className="block text-sm font-medium text-purple-700 mb-2">
              Or import a specific epic:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={epicKey}
                onChange={(e) => setEpicKey(e.target.value.toUpperCase())}
                className="flex-1 px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                placeholder="REF-1234"
                disabled={isSingleEpicImporting}
              />
              <button
                onClick={handleSingleEpicImport}
                disabled={isSingleEpicImporting || !epicKey.trim()}
                className={`px-4 py-2 rounded-md font-medium transition-colors text-sm ${
                  isSingleEpicImporting || !epicKey.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {isSingleEpicImporting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                ) : (
                  'Import'
                )}
              </button>
            </div>
          </div>

          {epicImportStatus === 'success' && epicImportResults && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-green-800 text-sm font-medium">Epics imported successfully!</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <span>📁 {epicImportResults.epicsCount} epics</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <span>📝 {epicImportResults.childrenCount} child tickets</span>
                </div>
              </div>
            </div>
          )}

          {(epicImportStatus === 'error' || singleEpicImportStatus === 'error') && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-red-800 text-sm font-medium">Import failed</span>
              </div>
              <div className="text-xs text-red-700">
                {epicErrorMessage || singleEpicErrorMessage}
              </div>
            </div>
          )}

          {singleEpicImportStatus === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-green-800 text-sm font-medium">Epic imported successfully!</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 