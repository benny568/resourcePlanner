import React, { useState } from 'react';
import { Download, Users, Briefcase, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { JiraIntegrationService, jiraIntegration } from '../services/jiraIntegration';
import { TeamMember, WorkItem } from '../types';

interface JiraImportProps {
  onImportComplete: (data: { teamMembers: TeamMember[]; workItems: WorkItem[] }) => void;
}

export const JiraImport: React.FC<JiraImportProps> = ({ onImportComplete }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [importResults, setImportResults] = useState<{
    teamMembersCount: number;
    workItemsCount: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [projectKey, setProjectKey] = useState('REF');

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

  const handleUseSampleData = () => {
    // Real data extracted from REF project
    const sampleTeamMembers = [
      {
        id: "6307a4e146556c726620d71c",
        name: "Tom Prior",
        capacity: 100,
        skills: ["backend" as const, "frontend" as const],
        personalHolidays: []
      },
      {
        id: "712020:6ddb69d2-48e6-452e-b840-c8f708dff299",
        name: "Joe Dockry",
        capacity: 100,
        skills: ["frontend" as const, "backend" as const],
        personalHolidays: []
      },
      {
        id: "712020:296153f9-8ff2-456b-9f07-9006d51bcd00",
        name: "Podge Heavin",
        capacity: 100,
        skills: ["frontend" as const, "backend" as const],
        personalHolidays: []
      },
      {
        id: "712020:1a520574-c381-4d56-a231-2ea63ba579af",
        name: "Aoife Leonard",
        capacity: 100,
        skills: ["backend" as const, "frontend" as const],
        personalHolidays: []
      },
      {
        id: "712020:d5bff7b5-357a-48ae-8780-7fad58a9ce06",
        name: "Udhaya Subramanian",
        capacity: 100,
        skills: ["backend" as const, "frontend" as const],
        personalHolidays: []
      },
      {
        id: "712020:f3f73bc1-eb10-4622-960d-75c2c1fdadf6",
        name: "Stori Walker",
        capacity: 100,
        skills: ["frontend" as const, "backend" as const],
        personalHolidays: []
      },
      {
        id: "712020:80438abf-4c77-4324-8d81-4b3831c76663",
        name: "Pooja Wasaikar",
        capacity: 100,
        skills: ["frontend" as const, "backend" as const],
        personalHolidays: []
      },
      {
        id: "64073eefc6e77744a1df12cb",
        name: "Szymon Wozniak",
        capacity: 100,
        skills: ["backend" as const, "frontend" as const],
        personalHolidays: []
      },
      {
        id: "63bfe6f194d18cbf6773094f",
        name: "Paul Kavanagh",
        capacity: 100,
        skills: ["backend" as const, "frontend" as const],
        personalHolidays: []
      },
      {
        id: "712020:7f05fed9-a531-4e02-a326-e90215c8a06e",
        name: "Oisin Daly",
        capacity: 100,
        skills: ["backend" as const, "frontend" as const],
        personalHolidays: []
      },
      {
        id: "712020:683326b7-40e2-4e6e-a231-9ceb0ba6f3b9",
        name: "Matthew Kolder",
        capacity: 100,
        skills: ["backend" as const, "frontend" as const],
        personalHolidays: []
      },
      {
        id: "712020:9b8b9151-01dd-42de-9609-6f46ef8f9cbb",
        name: "Jessica Moore",
        capacity: 100,
        skills: ["frontend" as const, "backend" as const],
        personalHolidays: []
      },
      {
        id: "61e1d76ee7637900688e9539",
        name: "Nedra Daniels",
        capacity: 100,
        skills: ["frontend" as const, "backend" as const],
        personalHolidays: []
      },
      {
        id: "712020:264ec497-7225-45ae-aefd-189a35484bdc",
        name: "Aditya Pimpalkar",
        capacity: 100,
        skills: ["frontend" as const, "backend" as const],
        personalHolidays: []
      },
      {
        id: "712020:172d9f99-db4a-410b-8a2b-f831f19f1782",
        name: "Brendan O'Daly",
        capacity: 100,
        skills: ["frontend" as const, "backend" as const],
        personalHolidays: []
      }
    ];

    const sampleWorkItems = [
      {
        id: "REF-2903",
        title: "2026 Sustainability",
        description: "Discussion/Planning session 23 June '25 (Tom, Podge, Brendan): Upgrade to .Net 10 (BE), Upgrade to latest Entity Core (BE), React upgrade to ver. 19, Performance testing APIs, Investigate the use of GraphQL to make requests more efficient, Content Writer refactor - define what a writer looks like so anyone can create a new one; define an interface etc., Automated tests improvements, UTs use in memory db - swap to use SQLite db., Increase coverage, Refactor logging and error messages to make them more helpful, add more logging",
        estimateStoryPoints: 13,
        requiredCompletionDate: new Date("2025-12-23T05:35:30.129Z"),
        requiredSkills: ["backend" as const, "frontend" as const],
        dependencies: [],
        status: "Not Started" as const,
        assignedSprints: []
      },
      {
        id: "REF-2843",
        title: "QFV Premium",
        description: "Help launch Premium offering for QFV",
        estimateStoryPoints: 8,
        requiredCompletionDate: new Date("2025-09-11T16:45:31.031Z"),
        requiredSkills: ["frontend" as const, "backend" as const],
        dependencies: [],
        status: "Not Started" as const,
        assignedSprints: []
      },
      {
        id: "REF-2804",
        title: "QFV - Testing of the Translation Layer between New Forms and CDI/Coding (Reformers)",
        description: "As the Reformers team, I need to test the translation layer between QFVC and QFVP form and CDI and Coding to make sure that everything is rendering correctly",
        estimateStoryPoints: 8,
        requiredCompletionDate: new Date("2025-08-29T22:57:58.176Z"),
        requiredSkills: ["backend" as const, "frontend" as const],
        dependencies: [],
        status: "Not Started" as const,
        assignedSprints: []
      },
      {
        id: "REF-2794",
        title: "Quality Focused Visit (Core)",
        description: "Help Launch QFV Visit",
        estimateStoryPoints: 8,
        requiredCompletionDate: new Date("2025-08-30T11:06:37.175Z"),
        requiredSkills: ["frontend" as const, "backend" as const],
        dependencies: [],
        status: "In Progress" as const,
        assignedSprints: []
      },
      {
        id: "REF-2664",
        title: "Reformers Team - .NET Repo GitHub Open Door Migration",
        description: "Project focuses on migrating our CI/CD pipelines, code management, and collaboration tools from Azure DevOps (ADO) to GitHub Enterprise Managed Users (EMU).",
        estimateStoryPoints: 13,
        requiredCompletionDate: new Date("2025-06-17T15:19:54.136Z"),
        requiredSkills: ["backend" as const],
        dependencies: [],
        status: "Not Started" as const,
        assignedSprints: []
      },
      {
        id: "REF-2650",
        title: "Cursor Training",
        description: "Cursor Training",
        estimateStoryPoints: 5,
        requiredCompletionDate: new Date("2025-07-23T16:14:46.747Z"),
        requiredSkills: ["frontend" as const, "backend" as const],
        dependencies: [],
        status: "Not Started" as const,
        assignedSprints: []
      },
      {
        id: "REF-2649",
        title: "Testing",
        description: "Goals: 1. Test and release all the features that are complete 2. Automate testing wherever possible 3. Test and release the new DFV form version Testing Spreadsheet: https://docs.google.com/spreadsheets/d/13BqJe6TMH_aUC60aWIzJXImBJfKTQ1osvSjKRd7ANOE/edit?gid=0#gid=0",
        estimateStoryPoints: 8,
        requiredCompletionDate: new Date("2025-07-23T16:13:44.696Z"),
        requiredSkills: ["frontend" as const, "backend" as const],
        dependencies: [],
        status: "In Progress" as const,
        assignedSprints: []
      },
      {
        id: "REF-2632",
        title: "Usability studies (2025)",
        description: "Epic to collect 2025 usability studies.",
        estimateStoryPoints: 8,
        requiredCompletionDate: new Date("2025-07-21T08:25:10.341Z"),
        requiredSkills: ["frontend" as const],
        dependencies: [],
        status: "In Progress" as const,
        assignedSprints: []
      },
      {
        id: "REF-2573",
        title: "Reformers GitHub Migration - Content Manager Service",
        description: "This epic holds user stories that can be used for migrating content-manager-service from Azure DevOps to GitHub.",
        estimateStoryPoints: 13,
        requiredCompletionDate: new Date("2025-07-08T10:05:43.783Z"),
        requiredSkills: ["backend" as const],
        dependencies: [],
        status: "In Progress" as const,
        assignedSprints: []
      },
      {
        id: "REF-2564",
        title: "blocked: CFV - Evaluation Form",
        description: "As Signify, I want to create a new form for Cognitive Focused Visit so Providers can review questions and functions required for the CFV interaction with members",
        estimateStoryPoints: 8,
        requiredCompletionDate: new Date("2025-07-02T09:20:20.969Z"),
        requiredSkills: ["frontend" as const, "backend" as const],
        dependencies: [],
        status: "Not Started" as const,
        assignedSprints: []
      },
      {
        id: "REF-2330",
        title: "PWA Analytics - Rules",
        description: "As a Content Owner and Product Owner for Content Weaver, I want to track how rules are used by clinicians in the field, so that I can see value of each rule and try and simplify the document where necessary",
        estimateStoryPoints: 8,
        requiredCompletionDate: new Date("2025-05-12T11:20:31.725Z"),
        requiredSkills: ["frontend" as const, "backend" as const],
        dependencies: [],
        status: "In Progress" as const,
        assignedSprints: []
      },
      {
        id: "REF-2311",
        title: "Enhance Create/edit Single Select and Multi Select type content",
        description: "Allow user to create new single select type question with display properties, Allow user to edit existing single select type questions with display properties, Allow user to create new multi-select type question with display properties, Allow user to edit existing multi-select type questions with display properties",
        estimateStoryPoints: 8,
        requiredCompletionDate: new Date("2025-05-10T14:27:53.988Z"),
        requiredSkills: ["frontend" as const, "backend" as const],
        dependencies: [],
        status: "Completed" as const,
        assignedSprints: []
      },
      {
        id: "REF-2297",
        title: "Content Weaver - User Metrics",
        description: "Track and analyze Content Weaver user metrics and engagement",
        estimateStoryPoints: 8,
        requiredCompletionDate: new Date("2025-05-06T15:00:05.244Z"),
        requiredSkills: ["backend" as const, "frontend" as const],
        dependencies: [],
        status: "In Progress" as const,
        assignedSprints: []
      },
      {
        id: "REF-2155",
        title: "Q1 2025 Sustainability",
        description: "Sustainability for Q1",
        estimateStoryPoints: 13,
        requiredCompletionDate: new Date("2025-04-10T11:05:40.217Z"),
        requiredSkills: ["backend" as const, "frontend" as const],
        dependencies: [],
        status: "Completed" as const,
        assignedSprints: []
      },
      {
        id: "REF-2140",
        title: "Concurrent Users",
        description: "As a Content Owner, I need my team to work simultaneously on different requests, allowing for parallel processing. Allow content owners to create and modify content and workflows without stepping on each others toes and overriding the work",
        estimateStoryPoints: 8,
        requiredCompletionDate: new Date("2025-04-09T15:33:02.933Z"),
        requiredSkills: ["backend" as const, "frontend" as const],
        dependencies: [],
        status: "Completed" as const,
        assignedSprints: []
      }
    ];

    onImportComplete({ teamMembers: sampleTeamMembers, workItems: sampleWorkItems });
    setImportStatus('success');
    setImportResults({ teamMembersCount: sampleTeamMembers.length, workItemsCount: sampleWorkItems.length });
    setErrorMessage('');
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
              <Loader className="h-5 w-5 animate-spin" />
              Importing from Jira...
            </>
          ) : (
            <>
              <Download className="h-5 w-5" />
              Import Team Members & Epics
            </>
          )}
        </button>

        {/* Status Messages */}
        {importStatus === 'importing' && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center gap-2">
              <Loader className="h-5 w-5 text-blue-600 animate-spin" />
              <span className="text-blue-800 font-medium">Importing data from Jira project "{projectKey}"...</span>
            </div>
            <div className="mt-2 text-sm text-blue-600">
              <div>• Extracting team members from recent issues</div>
              <div>• Converting epics to work items</div>
              <div>• Mapping statuses and skills</div>
            </div>
          </div>
        )}

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
                <span>Imported {importResults.workItemsCount} epics as work items</span>
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
          <h3 className="font-medium text-gray-800 mb-2">What will be imported:</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• <strong>Team Members:</strong> Extracted from issue assignees and reporters</li>
            <li>• <strong>Epics:</strong> Converted to work items with estimated story points</li>
            <li>• <strong>Skills:</strong> Inferred from issue labels (frontend/backend)</li>
            <li>• <strong>Status:</strong> Mapped from Jira status to planning status</li>
            <li>• <strong>Completion Dates:</strong> Calculated as 90 days from creation</li>
          </ul>
          <p className="text-xs text-gray-500 mt-2">
            Note: The imported data will be merged with existing data in your resource planner.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleImport}
            disabled={isImporting || !projectKey.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                Importing from Jira...
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Import Team Members & Epics
              </>
            )}
          </button>

          <button
            onClick={handleUseSampleData}
            disabled={isImporting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium transition-colors bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Use Sample Data
          </button>
        </div>

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
                <span>Imported {importResults.workItemsCount} epics as work items</span>
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
    </div>
  );
}; 