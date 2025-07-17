import React, { useState } from 'react';
import { PublicHoliday } from '../types';
import { Plus, Trash2, Calendar, Loader } from 'lucide-react';
import { format } from 'date-fns';
import { holidaysApi, transformers } from '../services/api';

interface HolidayManagementProps {
  publicHolidays: PublicHoliday[];
  onUpdatePublicHolidays: (holidays: PublicHoliday[]) => void;
}

export const HolidayManagement: React.FC<HolidayManagementProps> = ({
  publicHolidays,
  onUpdatePublicHolidays
}) => {
  const [isAddingHoliday, setIsAddingHoliday] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    impactPercentage: 100
  });
  const [isLoading, setIsLoading] = useState(false);
  const [operationMessage, setOperationMessage] = useState('');

  const resetForm = () => {
    setFormData({
      name: '',
      date: '',
      impactPercentage: 100
    });
    setIsAddingHoliday(false);
  };

  const showMessage = (message: string, isError: boolean = false) => {
    setOperationMessage(message);
    setTimeout(() => setOperationMessage(''), 3000);
  };

  const handleSubmit = async () => {
    if (formData.name.trim() && formData.date && !isLoading) {
      setIsLoading(true);
      try {
        const holidayData = {
          name: formData.name.trim(),
          date: new Date(formData.date),
          impactPercentage: formData.impactPercentage
        };

        // Create holiday via API
        const createdHoliday = await holidaysApi.create(transformers.holidayToApi(holidayData));
        const transformedHoliday = transformers.holidayFromApi(createdHoliday);

        // Update local state
        onUpdatePublicHolidays([...publicHolidays, transformedHoliday]);
        
        resetForm();
        showMessage('✅ Holiday added successfully!');
        console.log('Holiday created successfully:', transformedHoliday);
      } catch (error) {
        console.error('Error creating holiday:', error);
        showMessage('❌ Failed to add holiday. Please try again.', true);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const deleteHoliday = async (holidayId: string) => {
    if (!isLoading) {
      setIsLoading(true);
      try {
        // Delete holiday via API
        await holidaysApi.delete(holidayId);
        
        // Update local state
        onUpdatePublicHolidays(publicHolidays.filter(holiday => holiday.id !== holidayId));
        
        showMessage('✅ Holiday deleted successfully!');
        console.log('Holiday deleted successfully');
      } catch (error) {
        console.error('Error deleting holiday:', error);
        showMessage('❌ Failed to delete holiday. Please try again.', true);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const updateImpact = async (holidayId: string, impactPercentage: number) => {
    const holiday = publicHolidays.find(h => h.id === holidayId);
    if (!holiday || isLoading) return;

    setIsLoading(true);
    try {
      // Update holiday via API (delete and recreate since no PUT endpoint)
      await holidaysApi.delete(holidayId);
      
      const updatedHolidayData = {
        ...holiday,
        impactPercentage
      };
      
      const createdHoliday = await holidaysApi.create(transformers.holidayToApi(updatedHolidayData));
      const transformedHoliday = transformers.holidayFromApi(createdHoliday);
      
      // Update local state
      onUpdatePublicHolidays(
        publicHolidays.map(h =>
          h.id === holidayId ? transformedHoliday : h
        )
      );
      
      console.log('Holiday impact updated successfully');
    } catch (error) {
      console.error('Error updating holiday impact:', error);
      showMessage('❌ Failed to update holiday impact. Please try again.', true);
    } finally {
      setIsLoading(false);
    }
  };

  // Common holidays template
  const commonHolidays = [
    { name: 'New Year\'s Day', date: `${new Date().getFullYear()}-01-01` },
    { name: 'Memorial Day', date: `${new Date().getFullYear()}-05-29` },
    { name: 'Independence Day', date: `${new Date().getFullYear()}-07-04` },
    { name: 'Labor Day', date: `${new Date().getFullYear()}-09-04` },
    { name: 'Thanksgiving', date: `${new Date().getFullYear()}-11-23` },
    { name: 'Christmas Day', date: `${new Date().getFullYear()}-12-25` }
  ];

  const addCommonHoliday = async (name: string, date: string) => {
    const existingHoliday = publicHolidays.find(h => 
      format(h.date, 'yyyy-MM-dd') === date
    );
    
    if (!existingHoliday && !isLoading) {
      setIsLoading(true);
      try {
        const holidayData = {
          name,
          date: new Date(date),
          impactPercentage: 100
        };

        // Create holiday via API
        const createdHoliday = await holidaysApi.create(transformers.holidayToApi(holidayData));
        const transformedHoliday = transformers.holidayFromApi(createdHoliday);

        // Update local state
        onUpdatePublicHolidays([...publicHolidays, transformedHoliday]);
        
        showMessage(`✅ ${name} added successfully!`);
        console.log('Common holiday added successfully:', transformedHoliday);
      } catch (error) {
        console.error('Error adding common holiday:', error);
        showMessage('❌ Failed to add holiday. Please try again.', true);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const sortedHolidays = [...publicHolidays].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Public Holidays
          </h2>
          <button
            onClick={() => setIsAddingHoliday(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
            disabled={isLoading}
          >
            <Plus className="h-4 w-4" />
            Add Holiday
          </button>
        </div>

        {/* Operation message */}
        {operationMessage && (
          <div className={`mb-4 p-3 rounded-md text-center ${
            operationMessage.startsWith('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {operationMessage}
          </div>
        )}

        {/* Add holiday form */}
        {isAddingHoliday && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium mb-3">Add Public Holiday</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Holiday name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="px-3 py-2 border rounded-md"
              />
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="px-3 py-2 border rounded-md"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.impactPercentage}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    impactPercentage: Number(e.target.value) 
                  })}
                  className="px-3 py-2 border rounded-md w-20"
                />
                <span className="text-sm text-gray-500">% impact</span>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
                disabled={isLoading}
              >
                {isLoading ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : 'Add Holiday'}
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Common holidays quick add */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium mb-3">Quick Add Common Holidays ({new Date().getFullYear()})</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {commonHolidays.map((holiday) => (
              <button
                key={holiday.name}
                onClick={() => addCommonHoliday(holiday.name, holiday.date)}
                className="px-3 py-2 text-sm bg-white hover:bg-gray-50 border rounded-md text-left"
                disabled={publicHolidays.some(h => 
                  format(h.date, 'yyyy-MM-dd') === holiday.date || isLoading
                )}
              >
                {isLoading ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : holiday.name}
                {publicHolidays.some(h => format(h.date, 'yyyy-MM-dd') === holiday.date) && 
                  <span className="text-green-600 ml-1">✓</span>
                }
              </button>
            ))}
          </div>
        </div>

        {/* Holidays list */}
        <div className="space-y-3">
          {sortedHolidays.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No public holidays added yet. Add holidays to account for reduced team capacity.
            </div>
          ) : (
            sortedHolidays.map((holiday) => (
              <div key={holiday.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{holiday.name}</div>
                  <div className="text-sm text-gray-600">
                    {format(holiday.date, 'EEEE, MMM dd, yyyy')}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Impact:</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={holiday.impactPercentage}
                      onChange={(e) => updateImpact(holiday.id, Number(e.target.value))}
                      className="w-16 px-2 py-1 border rounded text-sm"
                      disabled={isLoading}
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                  
                  <button
                    onClick={() => deleteHoliday(holiday.id)}
                    className="px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Impact explanation */}
        <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-medium mb-2">Holiday Impact Explanation</h3>
          <div className="text-sm text-gray-700 space-y-1">
            <div>• <strong>100% Impact:</strong> Full day holiday - entire team is off</div>
            <div>• <strong>50% Impact:</strong> Half day or partial team holiday</div>
            <div>• <strong>0% Impact:</strong> Holiday doesn't affect development work</div>
            <div className="mt-2 text-gray-600">
              The impact percentage reduces the sprint velocity for any sprint that includes the holiday.
            </div>
          </div>
        </div>

        {/* Summary */}
        {publicHolidays.length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">Holiday Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium">Total Holidays:</span>
                <div className="text-lg font-bold text-blue-600">{publicHolidays.length}</div>
              </div>
              <div>
                <span className="font-medium">This Year:</span>
                <div className="text-lg font-bold text-blue-600">
                  {publicHolidays.filter(h => h.date.getFullYear() === new Date().getFullYear()).length}
                </div>
              </div>
              <div>
                <span className="font-medium">Full Day Holidays:</span>
                <div className="text-lg font-bold text-red-600">
                  {publicHolidays.filter(h => h.impactPercentage === 100).length}
                </div>
              </div>
              <div>
                <span className="font-medium">Avg Impact:</span>
                <div className="text-lg font-bold text-orange-600">
                  {publicHolidays.length > 0 
                    ? Math.round(publicHolidays.reduce((sum, h) => sum + h.impactPercentage, 0) / publicHolidays.length)
                    : 0}%
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 