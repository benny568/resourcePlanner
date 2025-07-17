import React, { useState } from 'react';
import { WorkItem, Skill } from '../types';
import { Plus, Trash2, Edit3, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { workItemsApi, transformers } from '../services/api';

interface WorkItemManagementProps {
  workItems: WorkItem[];
  onUpdateWorkItems: (items: WorkItem[]) => void;
}

export const WorkItemManagement: React.FC<WorkItemManagementProps> = ({
  workItems,
  onUpdateWorkItems
}) => {
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    estimateStoryPoints: 1,
    requiredCompletionDate: '',
    requiredSkills: [] as Skill[],
    dependencies: [] as string[]
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      estimateStoryPoints: 1,
      requiredCompletionDate: '',
      requiredSkills: [],
      dependencies: []
    });
    setIsAddingItem(false);
    setEditingItem(null);
  };

  const handleSubmit = async () => {
    if (formData.title.trim() && formData.requiredCompletionDate && formData.requiredSkills.length > 0 && !isLoading) {
      setIsLoading(true);
      try {
        const itemData = {
          title: formData.title.trim(),
          description: formData.description.trim(),
          estimateStoryPoints: formData.estimateStoryPoints,
          requiredCompletionDate: new Date(formData.requiredCompletionDate),
          requiredSkills: formData.requiredSkills,
          dependencies: formData.dependencies,
          status: 'Not Started' as const
        };

        if (editingItem) {
          // Update existing item
          const updatedItem = await workItemsApi.update(editingItem, transformers.workItemToApi(itemData));
          const transformedItem = transformers.workItemFromApi(updatedItem);
          
          onUpdateWorkItems(
            workItems.map(item => item.id === editingItem ? transformedItem : item)
          );
          console.log('Work item updated successfully');
        } else {
          // Create new item
          const createdItem = await workItemsApi.create(transformers.workItemToApi(itemData));
          const transformedItem = transformers.workItemFromApi(createdItem);
          
          onUpdateWorkItems([...workItems, transformedItem]);
          console.log('Work item created successfully');
        }

        resetForm();
      } catch (error) {
        console.error('Error saving work item:', error);
        alert('Failed to save work item. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const startEdit = (item: WorkItem) => {
    setFormData({
      title: item.title,
      description: item.description,
      estimateStoryPoints: item.estimateStoryPoints,
      requiredCompletionDate: format(item.requiredCompletionDate, 'yyyy-MM-dd'),
      requiredSkills: item.requiredSkills,
      dependencies: item.dependencies
    });
    setEditingItem(item.id);
    setIsAddingItem(true);
  };

  const deleteItem = async (itemId: string) => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        await workItemsApi.delete(itemId);
        onUpdateWorkItems(workItems.filter(item => item.id !== itemId));
        console.log('Work item deleted successfully');
      } catch (error) {
        console.error('Error deleting work item:', error);
        alert('Failed to delete work item. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const updateItemStatus = async (itemId: string, status: WorkItem['status']) => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        const item = workItems.find(i => i.id === itemId);
        if (!item) return;

        const updateData = {
          ...transformers.workItemToApi(item),
          status
        };

        const updatedItem = await workItemsApi.update(itemId, updateData);
        const transformedItem = transformers.workItemFromApi(updatedItem);
        
        onUpdateWorkItems(
          workItems.map(i => i.id === itemId ? transformedItem : i)
        );
        console.log('Work item status updated successfully');
      } catch (error) {
        console.error('Error updating work item status:', error);
        alert('Failed to update status. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const toggleSkill = (skill: Skill) => {
    setFormData(prev => ({
      ...prev,
      requiredSkills: prev.requiredSkills.includes(skill)
        ? prev.requiredSkills.filter(s => s !== skill)
        : [...prev.requiredSkills, skill]
    }));
  };

  const toggleDependency = (dependencyId: string) => {
    setFormData(prev => ({
      ...prev,
      dependencies: prev.dependencies.includes(dependencyId)
        ? prev.dependencies.filter(id => id !== dependencyId)
        : [...prev.dependencies, dependencyId]
    }));
  };

  // Get available work items for dependencies (excluding current item and circular dependencies)
  const getAvailableDependencies = () => {
    return workItems.filter(item => {
      // Exclude the current item being edited
      if (editingItem && item.id === editingItem) return false;
      
      // For new items, check against potential circular dependencies
      if (!editingItem) return true;
      
      // Prevent circular dependencies - if this item depends on the current item, don't allow it
      const wouldCreateCircularDependency = (itemId: string, targetId: string, visited: Set<string> = new Set()): boolean => {
        if (visited.has(itemId)) return true; // Found a cycle
        if (itemId === targetId) return true; // Direct circular dependency
        
        visited.add(itemId);
        const itemDeps = workItems.find(w => w.id === itemId)?.dependencies || [];
        
        return itemDeps.some(depId => wouldCreateCircularDependency(depId, targetId, new Set(visited)));
      };
      
      return !wouldCreateCircularDependency(item.id, editingItem);
    });
  };

  const getStatusIcon = (status: WorkItem['status']) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'In Progress':
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: WorkItem['status']) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-100 text-green-800';
      case 'In Progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Work Items</h2>
          <button
            onClick={() => setIsAddingItem(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Work Item
          </button>
        </div>

        {/* Add/Edit form */}
        {isAddingItem && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium mb-3">
              {editingItem ? 'Edit Work Item' : 'Add New Work Item'}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Work item title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
              <textarea
                placeholder="Description (optional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-md h-20 resize-none"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Estimate (Story Points)
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={formData.estimateStoryPoints}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      estimateStoryPoints: Number(e.target.value) 
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Required Completion Date
                  </label>
                  <input
                    type="date"
                    value={formData.requiredCompletionDate}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      requiredCompletionDate: e.target.value 
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Required Skills</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.requiredSkills.includes('frontend')}
                      onChange={() => toggleSkill('frontend')}
                      className="rounded"
                    />
                    <span className="text-sm">Frontend</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.requiredSkills.includes('backend')}
                      onChange={() => toggleSkill('backend')}
                      className="rounded"
                    />
                    <span className="text-sm">Backend</span>
                  </label>
                </div>
                {formData.requiredSkills.length === 0 && (
                  <p className="text-sm text-red-500 mt-1">Please select at least one skill</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Dependencies</label>
                <div className="max-h-32 overflow-y-auto border rounded p-2 bg-gray-50">
                  {getAvailableDependencies().length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No work items available as dependencies</p>
                  ) : (
                    <div className="space-y-2">
                      {getAvailableDependencies().map(item => (
                        <label key={item.id} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={formData.dependencies.includes(item.id)}
                            onChange={() => toggleDependency(item.id)}
                            className="rounded mt-0.5"
                          />
                          <div className="flex-1">
                            <div className="font-medium">{item.title}</div>
                            <div className="text-xs text-gray-500">
                              {item.estimateStoryPoints} pts • Due: {format(item.requiredCompletionDate, 'MMM dd, yyyy')}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Work items that must be completed before this item can start
                </p>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
                >
                  {editingItem ? 'Update' : 'Add'} Work Item
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Work items list */}
        <div className="space-y-3">
          {workItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No work items added yet. Click "Add Work Item" to get started.
            </div>
          ) : (
            workItems.map((item) => (
              <div key={item.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{item.title}</h3>
                    {item.description && (
                      <p className="text-gray-600 mt-1">{item.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => startEdit(item)}
                      className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="font-medium">
                      {item.estimateStoryPoints} story points
                    </span>
                    <span>
                      Due: {format(item.requiredCompletionDate, 'MMM dd, yyyy')}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="font-medium">Skills:</span>
                      <div className="flex gap-1">
                        {item.requiredSkills.map(skill => (
                          <span 
                            key={skill}
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              skill === 'frontend' 
                                ? 'bg-purple-100 text-purple-800' 
                                : 'bg-orange-100 text-orange-800'
                            }`}
                          >
                            {skill === 'frontend' ? 'FE' : 'BE'}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Dependencies */}
                  {item.dependencies.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                      <span className="font-medium">Dependencies:</span>
                      <div className="flex flex-wrap gap-1">
                        {item.dependencies.map(depId => {
                          const depItem = workItems.find(w => w.id === depId);
                          if (!depItem) return null;
                          return (
                            <span 
                              key={depId}
                              className={`px-2 py-1 rounded text-xs font-medium border ${
                                depItem.status === 'Completed' 
                                  ? 'bg-green-100 text-green-800 border-green-200' 
                                  : 'bg-yellow-100 text-yellow-800 border-yellow-200'
                              }`}
                              title={`${depItem.title} (${depItem.status})`}
                            >
                              {depItem.title}
                              {depItem.status === 'Completed' ? ' ✓' : ' ⏳'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <select
                      value={item.status}
                      onChange={(e) => updateItemStatus(item.id, e.target.value as WorkItem['status'])}
                      className="px-2 py-1 border rounded text-sm"
                    >
                      <option value="Not Started">Not Started</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(item.status)}`}>
                      {getStatusIcon(item.status)}
                      {item.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Summary */}
        {workItems.length > 0 && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold mb-2">Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium">Total Items:</span>
                <div className="text-lg font-bold text-blue-600">{workItems.length}</div>
              </div>
              <div>
                <span className="font-medium">Total Story Points:</span>
                <div className="text-lg font-bold text-blue-600">
                  {workItems.reduce((sum, item) => sum + item.estimateStoryPoints, 0)}
                </div>
              </div>
              <div>
                <span className="font-medium">Completed:</span>
                <div className="text-lg font-bold text-green-600">
                  {workItems.filter(item => item.status === 'Completed').length}
                </div>
              </div>
              <div>
                <span className="font-medium">In Progress:</span>
                <div className="text-lg font-bold text-yellow-600">
                  {workItems.filter(item => item.status === 'In Progress').length}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 