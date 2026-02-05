import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { CRM } from './components/CRM';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return <CRM />;
}

export default App;
