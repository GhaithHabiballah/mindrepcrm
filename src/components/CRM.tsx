import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut } from 'lucide-react';
import { MasterLeads } from './MasterLeads';
import { OutreachView } from './OutreachView';
import { TempLeads } from './TempLeads';
import { AddFieldModal } from './AddFieldModal';

type Tab = 'master' | 'email' | 'sms' | 'instagram' | 'linkedin' | 'phone' | 'temp';

export function CRM() {
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('master');
  const [showAddField, setShowAddField] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'master', label: 'Master Leads' },
    { id: 'email', label: 'Email' },
    { id: 'sms', label: 'SMS' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'phone', label: 'Phone' },
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
        {activeTab === 'master' && <MasterLeads key={refreshKey} />}
        {activeTab === 'email' && <OutreachView method="email" key={refreshKey} onUpdate={handleRefresh} />}
        {activeTab === 'sms' && <OutreachView method="sms" key={refreshKey} onUpdate={handleRefresh} />}
        {activeTab === 'instagram' && <OutreachView method="instagram" key={refreshKey} onUpdate={handleRefresh} />}
        {activeTab === 'linkedin' && <OutreachView method="linkedin" key={refreshKey} onUpdate={handleRefresh} />}
        {activeTab === 'phone' && <OutreachView method="phone" key={refreshKey} onUpdate={handleRefresh} />}
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
    </div>
  );
}
