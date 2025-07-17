import React, { useState } from 'react';
import { TeamMember, PersonalHoliday, Skill } from '../types';
import { Plus, Trash2, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { teamMembersApi, transformers } from '../services/api';

interface TeamManagementProps {
  teamMembers: TeamMember[];
  onUpdateTeamMembers: (members: TeamMember[]) => void;
}

export const TeamManagement: React.FC<TeamManagementProps> = ({
  teamMembers,
  onUpdateTeamMembers
}) => {
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberCapacity, setNewMemberCapacity] = useState(100);
  const [newMemberSkills, setNewMemberSkills] = useState<Skill[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [newHolidayStart, setNewHolidayStart] = useState('');
  const [newHolidayEnd, setNewHolidayEnd] = useState('');
  const [newHolidayDescription, setNewHolidayDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const addTeamMember = async () => {
    if (newMemberName.trim() && !isLoading) {
      setIsLoading(true);
      try {
        // Create member via API
        const memberData = {
          name: newMemberName.trim(),
          capacity: newMemberCapacity,
          skills: newMemberSkills
        };
        
        const createdMember = await teamMembersApi.create(memberData);
        const transformedMember = transformers.teamMemberFromApi(createdMember);
        
        // Update local state
        onUpdateTeamMembers([...teamMembers, transformedMember]);
        
        // Reset form
        setNewMemberName('');
        setNewMemberCapacity(100);
        setNewMemberSkills([]);
        
        console.log('Team member created successfully:', transformedMember);
      } catch (error) {
        console.error('Error creating team member:', error);
        alert('Failed to create team member. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const removeMember = async (memberId: string) => {
    if (!isLoading) {
      setIsLoading(true);
      console.log(`🗑️ Attempting to delete team member: ${memberId}`);
      
      try {
        // Delete member via API
        console.log(`📡 Calling API to delete team member: ${memberId}`);
        const response = await teamMembersApi.delete(memberId);
        console.log(`📡 API response:`, response);
        
        // Update local state
        onUpdateTeamMembers(teamMembers.filter(member => member.id !== memberId));
        
        if (selectedMember === memberId) {
          setSelectedMember(null);
        }
        
        console.log(`✅ Team member deleted successfully: ${memberId}`);
      } catch (error) {
        console.error(`❌ Error deleting team member ${memberId}:`, error);
        alert(`Failed to delete team member. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    } else {
      console.log(`⚠️ Cannot delete team member ${memberId} - operation already in progress`);
    }
  };

  const updateMemberCapacity = async (memberId: string, capacity: number) => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        const member = teamMembers.find(m => m.id === memberId);
        if (!member) return;
        
        // Update member via API
        const updateData = {
          name: member.name,
          capacity: capacity,
          skills: member.skills
        };
        
        const updatedMember = await teamMembersApi.update(memberId, updateData);
        const transformedMember = transformers.teamMemberFromApi(updatedMember);
        
        // Update local state
        onUpdateTeamMembers(
          teamMembers.map(m =>
            m.id === memberId ? transformedMember : m
          )
        );
        
        console.log('Team member capacity updated successfully');
      } catch (error) {
        console.error('Error updating team member capacity:', error);
        alert('Failed to update capacity. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const updateMemberSkills = async (memberId: string, skills: Skill[]) => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        const member = teamMembers.find(m => m.id === memberId);
        if (!member) return;
        
        // Update member via API
        const updateData = {
          name: member.name,
          capacity: member.capacity,
          skills: skills
        };
        
        const updatedMember = await teamMembersApi.update(memberId, updateData);
        const transformedMember = transformers.teamMemberFromApi(updatedMember);
        
        // Update local state
        onUpdateTeamMembers(
          teamMembers.map(m =>
            m.id === memberId ? transformedMember : m
          )
        );
        
        console.log('Team member skills updated successfully');
      } catch (error) {
        console.error('Error updating team member skills:', error);
        alert('Failed to update skills. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const toggleNewMemberSkill = (skill: Skill) => {
    setNewMemberSkills(prev => 
      prev.includes(skill) 
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  };

  const toggleMemberSkill = (memberId: string, skill: Skill) => {
    const member = teamMembers.find(m => m.id === memberId);
    if (member) {
      const updatedSkills = member.skills.includes(skill)
        ? member.skills.filter(s => s !== skill)
        : [...member.skills, skill];
      updateMemberSkills(memberId, updatedSkills);
    }
  };

  const addPersonalHoliday = async () => {
    if (selectedMember && newHolidayStart && newHolidayEnd && !isLoading) {
      setIsLoading(true);
      try {
        const holidayData = {
          startDate: newHolidayStart,
          endDate: newHolidayEnd,
          description: newHolidayDescription.trim() || 'Personal Time Off'
        };
        
        // Add holiday via API
        const createdHoliday = await teamMembersApi.addHoliday(selectedMember, holidayData);
        
        // Update local state by refetching member data
        const updatedMember = await teamMembersApi.getAll().then(members => 
          members.find(m => m.id === selectedMember)
        );
        
        if (updatedMember) {
          const transformedMember = transformers.teamMemberFromApi(updatedMember);
          onUpdateTeamMembers(
            teamMembers.map(member =>
              member.id === selectedMember ? transformedMember : member
            )
          );
        }
        
        // Reset form
        setNewHolidayStart('');
        setNewHolidayEnd('');
        setNewHolidayDescription('');
        
        console.log('Personal holiday added successfully');
      } catch (error) {
        console.error('Error adding personal holiday:', error);
        alert('Failed to add holiday. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const removePersonalHoliday = async (memberId: string, holidayId: string) => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        // Remove holiday via API
        await teamMembersApi.removeHoliday(memberId, holidayId);
        
        // Update local state by refetching member data
        const updatedMember = await teamMembersApi.getAll().then(members => 
          members.find(m => m.id === memberId)
        );
        
        if (updatedMember) {
          const transformedMember = transformers.teamMemberFromApi(updatedMember);
          onUpdateTeamMembers(
            teamMembers.map(member =>
              member.id === memberId ? transformedMember : member
            )
          );
        }
        
        console.log('Personal holiday removed successfully');
      } catch (error) {
        console.error('Error removing personal holiday:', error);
        alert('Failed to remove holiday. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const selectedMemberData = teamMembers.find(m => m.id === selectedMember);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <User className="h-5 w-5" />
          Team Members
        </h2>
        
        {/* Add new member */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-3">Add Team Member</h3>
          <div className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <input
                type="text"
                placeholder="Member name"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                className="px-3 py-2 border rounded-md flex-1 min-w-48"
              />
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Capacity:</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={newMemberCapacity}
                  onChange={(e) => setNewMemberCapacity(Number(e.target.value))}
                  className="px-3 py-2 border rounded-md w-20"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Skills:</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newMemberSkills.includes('frontend')}
                    onChange={() => toggleNewMemberSkill('frontend')}
                    className="rounded"
                  />
                  <span className="text-sm">Frontend</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newMemberSkills.includes('backend')}
                    onChange={() => toggleNewMemberSkill('backend')}
                    className="rounded"
                  />
                  <span className="text-sm">Backend</span>
                </label>
              </div>
            </div>
            
            <button
              onClick={addTeamMember}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
              disabled={!newMemberName.trim() || newMemberSkills.length === 0 || isLoading}
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        {/* Team members list */}
        <div className="space-y-3">
          {teamMembers.map((member) => (
            <div key={member.id} className="p-3 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="font-medium">{member.name}</div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Capacity:</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={member.capacity}
                      onChange={(e) => updateMemberCapacity(member.id, Number(e.target.value))}
                      className="px-2 py-1 border rounded w-16 text-sm"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    ({member.personalHolidays.length} holidays)
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedMember(member.id)}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    Manage Holidays
                  </button>
                  <button
                    onClick={() => removeMember(member.id)}
                    className="px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-600">Skills:</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={member.skills.includes('frontend')}
                      onChange={() => toggleMemberSkill(member.id, 'frontend')}
                      className="rounded"
                    />
                    <span className="text-sm">Frontend</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={member.skills.includes('backend')}
                      onChange={() => toggleMemberSkill(member.id, 'backend')}
                      className="rounded"
                    />
                    <span className="text-sm">Backend</span>
                  </label>
                </div>
                {member.skills.length === 0 && (
                  <span className="text-sm text-red-500">No skills assigned</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Personal holidays management */}
      {selectedMember && selectedMemberData && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Personal Holidays for {selectedMemberData.name}
          </h3>

          {/* Add new holiday */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium mb-3">Add Personal Holiday</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="date"
                value={newHolidayStart}
                onChange={(e) => setNewHolidayStart(e.target.value)}
                className="px-3 py-2 border rounded-md"
                placeholder="Start date"
              />
              <input
                type="date"
                value={newHolidayEnd}
                onChange={(e) => setNewHolidayEnd(e.target.value)}
                className="px-3 py-2 border rounded-md"
                placeholder="End date"
              />
              <input
                type="text"
                value={newHolidayDescription}
                onChange={(e) => setNewHolidayDescription(e.target.value)}
                placeholder="Description (optional)"
                className="px-3 py-2 border rounded-md"
              />
              <button
                onClick={addPersonalHoliday}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center justify-center gap-2"
                disabled={!newHolidayStart || !newHolidayEnd || isLoading}
              >
                <Plus className="h-4 w-4" />
                Add Holiday
              </button>
            </div>
          </div>

          {/* Holidays list */}
          <div className="space-y-2">
            {selectedMemberData.personalHolidays.map((holiday) => (
              <div key={holiday.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium">{holiday.description}</div>
                  <div className="text-sm text-gray-600">
                    {format(holiday.startDate, 'MMM dd, yyyy')} - {format(holiday.endDate, 'MMM dd, yyyy')}
                  </div>
                </div>
                <button
                  onClick={() => removePersonalHoliday(selectedMember, holiday.id)}
                  className="px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {selectedMemberData.personalHolidays.length === 0 && (
              <div className="text-gray-500 text-center py-4">No personal holidays added</div>
            )}
          </div>

          <button
            onClick={() => setSelectedMember(null)}
            className="mt-4 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            disabled={isLoading}
          >
            Close Holiday Management
          </button>
        </div>
      )}
    </div>
  );
}; 