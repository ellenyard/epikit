/**
 * Collect Component
 *
 * Provides the data collection interface for entering case data using
 * custom forms created in the Form Builder. Users can select from
 * available forms and enter data which is then stored as records
 * in the associated dataset.
 */
import { useState } from 'react';
import type { FormDefinition } from '../../types/form';
import { DataEntryForm } from './DataEntryForm';

interface CollectProps {
  formDefinitions: FormDefinition[];
  onSubmit: (formId: string, data: Record<string, unknown>) => void;
  getSubmissionCount: (formId: string) => number;
  onViewInAnalysis: (formId: string) => void;
}

export function Collect({
  formDefinitions,
  onSubmit,
  getSubmissionCount,
  onViewInAnalysis,
}: CollectProps) {
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  const selectedForm = formDefinitions.find(f => f.id === selectedFormId);

  const handleSelectForm = (formId: string) => {
    setSelectedFormId(formId);
    setShowSidebar(false);
  };

  const handleSubmit = (data: Record<string, unknown>) => {
    if (selectedFormId) {
      onSubmit(selectedFormId, data);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* Mobile toolbar */}
      <div className="lg:hidden flex items-center gap-2 p-2 bg-white border-b border-gray-200">
        <button
          onClick={() => setShowSidebar(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Forms
        </button>
        {selectedForm && (
          <span className="text-sm text-gray-500 truncate">
            {selectedForm.name}
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Available Forms
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {formDefinitions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">No forms available</p>
                <p className="text-xs mt-2">Create a form in the Forms module first</p>
              </div>
            ) : (
              <div className="space-y-1">
                {formDefinitions.map((form) => {
                  const count = getSubmissionCount(form.id);
                  return (
                    <div
                      key={form.id}
                      className={`group p-3 rounded-lg cursor-pointer ${
                        selectedFormId === form.id
                          ? 'bg-blue-50 border border-blue-200'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => handleSelectForm(form.id)}
                    >
                      <p className={`text-sm font-medium truncate ${
                        selectedFormId === form.id ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {form.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {count} submission{count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Sidebar Overlay */}
        {showSidebar && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setShowSidebar(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Select Form</h2>
                <button onClick={() => setShowSidebar(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {formDefinitions.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">No forms available</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {formDefinitions.map((form) => {
                      const count = getSubmissionCount(form.id);
                      return (
                        <div
                          key={form.id}
                          className={`p-3 rounded-lg cursor-pointer ${
                            selectedFormId === form.id
                              ? 'bg-blue-50 border border-blue-200'
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => handleSelectForm(form.id)}
                        >
                          <p className={`text-sm font-medium ${
                            selectedFormId === form.id ? 'text-blue-900' : 'text-gray-900'
                          }`}>
                            {form.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {count} submission{count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedForm ? (
            <DataEntryForm
              form={selectedForm}
              onSubmit={handleSubmit}
              onViewInAnalysis={() => onViewInAnalysis(selectedForm.id)}
              submissionCount={getSubmissionCount(selectedForm.id)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="mt-4 text-lg">Select a form to start collecting data</p>
                {formDefinitions.length === 0 && (
                  <p className="mt-2 text-sm">Create a form in the Forms module first</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
