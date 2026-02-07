import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, X } from 'lucide-react';
import { MasterLeads } from './MasterLeads';
import { OutreachView } from './OutreachView';
import { TempLeads } from './TempLeads';
import { AddFieldModal } from './AddFieldModal';
import { AddCategoryModal } from './AddCategoryModal';
import { supabase } from '../lib/supabase';
import { Documentation } from './Documentation';

type Tab = 'master' | 'temp' | 'docs' | string;

type OutreachMethod = {
  key: string;
  label: string;
};

export function CRM() {
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('master');
  const [showAddField, setShowAddField] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [methods, setMethods] = useState<OutreachMethod[]>([
    { key: 'email', label: 'Email' },
    { key: 'sms', label: 'SMS' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'phone', label: 'Phone' },
  ]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const loadMethods = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('outreach_methods')
        .select('key,label')
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data && data.length > 0) {
        setMethods(data);
      }
    } catch (error) {
      console.error('Error loading outreach methods:', error);
    }
  }, []);

  useEffect(() => {
    loadMethods();
    const channel = supabase
      .channel('outreach-methods-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'outreach_methods' },
        () => {
          loadMethods();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadMethods]);

  const handleDeleteMethod = async (key: string, label: string) => {
    if (!confirm(`Delete "${label}" outreach method? Leads using it won't be deleted, but their outreach method will become unlinked.`)) return;

    try {
      const { error } = await supabase
        .from('outreach_methods')
        .delete()
        .eq('key', key);

      if (error) throw error;

      if (activeTab === key) setActiveTab('master');
      loadMethods();
    } catch (error) {
      console.error('Error deleting outreach method:', error);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'master', label: 'Master Leads' },
    ...methods.map((method) => ({ id: method.key, label: method.label })),
    { id: 'temp', label: 'Temp Import' },
    { id: 'docs', label: 'Documentation' },
  ];

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <header className="bg-gray-950 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-xl font-bold text-white">Outbound CRM</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950 text-purple-200 text-xs font-medium border border-purple-700">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-400" />
                Realtime On
              </div>
              <button
                onClick={() => setShowAddCategory(true)}
                className="px-4 py-2 bg-purple-900 text-white rounded-md hover:bg-purple-800 text-sm font-medium"
              >
                Add Category
              </button>
              <button
                onClick={() => setShowAddField(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-500 text-sm font-medium"
              >
                Add New Lead Info
              </button>
              <button
                onClick={() => signOut()}
                className="flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-gray-800 bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const isOutreachTab = tab.id !== 'master' && tab.id !== 'temp';
              return (
                <div key={tab.id} className="relative flex items-center group">
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === tab.id
                        ? 'border-purple-400 text-purple-200'
                        : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                  {isOutreachTab && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMethod(tab.id, tab.label);
                      }}
                      className="ml-1 p-0.5 rounded-full text-gray-500 hover:text-red-400 hover:bg-red-950 opacity-0 group-hover:opacity-100 transition-opacity"
                      title={`Delete ${tab.label}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'master' && (
          <MasterLeads key={refreshKey} outreachOptions={methods} />
        )}
        {activeTab !== 'master' && activeTab !== 'temp' && activeTab !== 'docs' && (
          <OutreachView
            method={activeTab}
            label={methods.find((m) => m.key === activeTab)?.label || activeTab}
            outreachOptions={methods}
            key={refreshKey}
            onUpdate={handleRefresh}
          />
        )}
        {activeTab === 'temp' && <TempLeads onImport={handleRefresh} outreachOptions={methods} />}
        {activeTab === 'docs' && <Documentation />}
      </main>

      {showAddField && (
        <AddFieldModal
          onClose={() => setShowAddField(false)}
          onSuccess={() => {
            setShowAddField(false);
            handleRefresh();
          }}
        />
      )}

      {showAddCategory && (
        <AddCategoryModal
          onClose={() => setShowAddCategory(false)}
          onSuccess={() => {
            setShowAddCategory(false);
            loadMethods();
          }}
        />
      )}
    </div>
  );
}
