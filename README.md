# Resource Planning Application

A comprehensive resource planning application for development teams built with React, TypeScript, and Tailwind CSS.

## Features

### 🏢 Team Management

- Add and manage team members
- Set individual capacity percentages (0-100%)
- Manage personal holidays and PTO for each team member
- Track holiday impact on sprint capacity

### 📋 Work Item Management

- Create work items with estimates (story points)
- Set required completion dates
- Track status (Not Started, In Progress, Completed)
- View work item summaries and progress

### 🏃‍♂️ Sprint Configuration

- Configure sprint duration and default velocity
- Set first sprint start date
- Auto-generate sprints for the entire year
- Adjust individual sprint velocities
- Generate additional years as needed

### 🎯 Sprint Planning

- **Drag & Drop Interface**: Visually assign work items to sprints
- **Auto-Assignment**: Intelligent assignment based on deadlines and capacity
- **Capacity Management**: Real-time utilization tracking with visual indicators
- **Deadline Awareness**: Overdue items highlighted for immediate attention
- **Manual Assignment**: Fine-tune assignments with remove/reassign options

### 🎄 Holiday Management

- Add public holidays with custom impact percentages
- Quick-add common holidays (New Year's, Christmas, etc.)
- Track holiday impact on team capacity
- View holiday summaries and statistics

### 📅 Calendar View

- **Month View**: See sprints, holidays, and work item deadlines
- **Sprint View**: Detailed sprint capacity planning with utilization indicators
- Navigate between months
- View capacity utilization warnings (over/under allocated)
- Track overdue work items

### 📊 Dashboard

- Key metrics overview (team size, work items, completion percentage)
- Progress tracking with visual indicators
- Current sprint information
- Risk assessment and alerts
- Upcoming deadlines
- Team capacity analysis

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd resourcePlanner
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

## Usage Guide

### Initial Setup

1. **Configure Sprints**: Start with the "Sprint Configuration" tab to set up your sprint parameters
2. **Add Team Members**: Go to "Team Management" to add your team members and set their capacity
3. **Add Public Holidays**: Use "Holidays" tab to add company holidays that affect the entire team
4. **Create Work Items**: Use "Work Items" tab to add your backlog items with estimates and deadlines
5. **Plan Sprints**: Use "Sprint Planning" to assign work items to specific sprints

### Daily Usage

1. **Dashboard**: Get an overview of your team's progress and any risks
2. **Sprint Planning**: Assign new work items to upcoming sprints
3. **Calendar View**: Visualize your sprints and plan work allocation
4. **Update Work Items**: Track progress by updating work item statuses
5. **Manage Personal Time Off**: Add personal holidays for team members as needed

## Key Concepts

### Capacity Calculation

- **Team Capacity**: Based on individual member capacity percentages
- **Public Holiday Impact**: Reduces entire team capacity by specified percentage
- **Personal Holiday Impact**: Reduces individual member capacity for affected sprints
- **Sprint Velocity**: Total story points the team can complete in a sprint

### Work Item Scheduling

- Work items are assigned to sprints using the Sprint Planning interface
- **Auto-Assignment**: Intelligently assigns items based on deadlines and available capacity
- **Manual Planning**: Drag and drop work items into specific sprints
- **Capacity Awareness**: Visual indicators show sprint utilization (aim for 70-90%)
- **Deadline Tracking**: Overdue items are highlighted for immediate attention

### Risk Management

- **Red Alerts**: Overdue work items, over-allocated sprints
- **Yellow Warnings**: Under-allocated sprints, many upcoming deadlines
- **Blue Info**: Upcoming holidays, general information

## Technical Features

### Data Persistence

- All data is automatically saved to browser's localStorage
- No backend required - runs entirely in the browser
- Data persists between sessions

### Responsive Design

- Mobile-friendly interface with collapsible navigation
- Optimized for desktop, tablet, and mobile devices
- Touch-friendly controls and interactions

### Modern Tech Stack

- **React 18** with TypeScript for type safety
- **Tailwind CSS** for responsive styling
- **date-fns** for reliable date calculations
- **Lucide React** for beautiful icons
- **Vite** for fast development and building

## Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run format       # Format code with Prettier
npm run format:check # Check code formatting

# Testing
npm run test         # Run unit tests
npm run test:ui      # Run tests with UI
npm run test:coverage # Run tests with coverage
npm run test:e2e     # Run end-to-end tests
```

## Configuration Options

### Sprint Configuration

- **Sprint Duration**: 1-30 days (typically 14 days)
- **Default Velocity**: Story points per sprint
- **Start Date**: When your first sprint begins

### Team Configuration

- **Capacity**: Individual team member availability (0-100%)
- **Personal Holidays**: Individual time off periods

### Holiday Configuration

- **Impact Percentage**: How much a holiday reduces team capacity
  - 100%: Full day off for entire team
  - 50%: Half day or partial team affected
  - 0%: No impact on development work

## Best Practices

1. **Regular Updates**: Update work item statuses weekly
2. **Capacity Planning**: Keep sprint utilization between 70-90%
3. **Sprint Planning**: Use auto-assign as a starting point, then manually adjust
4. **Holiday Planning**: Add holidays well in advance
5. **Team Communication**: Use the dashboard to identify risks early
6. **Deadline Management**: Set realistic completion dates and monitor overdue items

## Troubleshooting

### Data Not Persisting

- Check browser localStorage permissions
- Ensure you're using the same browser and device
- Clear browser cache if data becomes corrupted

### Calendar Not Showing Sprints

- Verify sprint configuration is set up correctly
- Check that sprint start date is reasonable
- Regenerate sprints if dates seem incorrect

### Work Items Not Showing in Sprints

- Go to Sprint Planning to assign work items to sprints
- Use Auto-Assign or drag and drop items manually
- Check that work items have been created in Work Items tab

### Capacity Calculations Seem Wrong

- Verify team member capacity percentages
- Check that holidays are set up with correct impact percentages
- Ensure personal holidays don't overlap incorrectly
- Review sprint assignments in Sprint Planning tab

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For questions or issues, please check the troubleshooting section above or create an issue in the repository.
