import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut } from 'lucide-react';
import { MasterLeads } from './MasterLeads';
import { OutreachView } from './OutreachView';
import { TempLeads } from './TempLeads';
import { AddFieldModal } from './AddFieldModal';
import { AddCategoryModal } from './AddCategoryModal';
import { supabase } from '../lib/supabase';

type Tab = 'master' | 'temp' | string;

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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'master', label: 'Master Leads' },
    ...methods.map((method) => ({ id: method.key, label: method.label })),
    { id: 'temp', label: 'Temp Import' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-xl font-bold text-gray-900">Outbound CRM</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-200">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                Realtime On
              </div>
              <button
                onClick={() => setShowAddCategory(true)}
                className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-black text-sm font-medium"
              >
                Add Category
              </button>
              <button
                onClick={() => setShowAddField(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                Add New Lead Info
              </button>
              <button
                onClick={() => signOut()}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'master' && (
          <MasterLeads key={refreshKey} outreachOptions={methods.map((m) => m.key)} />
        )}
        {activeTab !== 'master' && activeTab !== 'temp' && (
          <OutreachView
            method={activeTab}
            label={methods.find((m) => m.key === activeTab)?.label || activeTab}
            outreachOptions={methods.map((m) => m.key)}
            key={refreshKey}
            onUpdate={handleRefresh}
          />
        )}
        {activeTab === 'temp' && <TempLeads onImport={handleRefresh} />}
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
