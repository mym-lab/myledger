import React, { useState, useEffect } from 'react';

function AdminDashboard() {
  const [activeUsers, setActiveUsers] = useState([]);
  const [paymentStats, setPaymentStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userStats, setUserStats] = useState(null);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getToken = () => {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  };

  const fetchData = async () => {
    try {
      const token = getToken();
      
      // Fetch active users
      const usersRes = await fetch('/api/monitoring/active-users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setActiveUsers(usersData.users || []);
      }

      // Fetch payment stats
      const statsRes = await fetch('/api/monitoring/payment-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setPaymentStats(statsData);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error.message);
      setLoading(false);
    }
  };

  const fetchUserStats = async (userId) => {
    try {
      const token = getToken();
      const res = await fetch(`/api/monitoring/user-stats/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserStats(data);
      }
    } catch (error) {
      console.error('Error fetching user stats:', error);
    }
  };

  const handleUserClick = (user) => {
    setSelectedUser(user);
    fetchUserStats(user.id);
  };

  if (loading) return <div style={styles.loading}>Loading dashboard...</div>;
  if (error) return <div style={styles.error}>Error: {error}</div>;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>👥 Admin Command Center</h1>

      {/* Metrics Row */}
      <div style={styles.metricsRow}>
        <MetricCard 
          label="Total Users" 
          value={paymentStats?.total_users || 0}
          icon="👤"
        />
        <MetricCard 
          label="Active Now" 
          value={activeUsers.length}
          icon="🟢"
        />
        <MetricCard 
          label="Revenue" 
          value={`₱${paymentStats?.total_revenue || 0}`}
          icon="💰"
        />
        <MetricCard 
          label="Overdue" 
          value={paymentStats?.overdue_count || 0}
          icon="⚠️"
        />
      </div>

      {/* Active Users Table */}
      <div style={styles.section}>
        <h2>Active Users (Last 5 minutes)</h2>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>User Name</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Plan</th>
                <th style={styles.th}>Last Activity</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {activeUsers.length > 0 ? (
                activeUsers.map((user, idx) => (
                  <tr key={idx} style={styles.tableRow}>
                    <td style={styles.td}>{user.name}</td>
                    <td style={styles.td}>{user.email}</td>
                    <td style={styles.td}>{user.plan}</td>
                    <td style={styles.td}>{user.last_activity}</td>
                    <td style={styles.td}>
                      <span style={{
                        color: user.status === 'online' ? 'green' : 'gray',
                        fontWeight: 'bold'
                      }}>
                        {user.status === 'online' ? '🟢 Online' : '🔴 Away'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button 
                        onClick={() => handleUserClick(user)}
                        style={styles.btnView}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>
                    No active users
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Statistics */}
      <div style={styles.section}>
        <h2>💳 Payment Status</h2>
        {paymentStats && (
          <div style={styles.statsGrid}>
            <StatBox 
              label="Total Revenue" 
              value={`₱${paymentStats.total_revenue}`}
              color="#4CAF50"
            />
            <StatBox 
              label="Paid Subscriptions" 
              value={paymentStats.payment_count}
              color="#2196F3"
            />
            <StatBox 
              label="Pending Payments" 
              value={`₱${paymentStats.pending_payments}`}
              color="#FF9800"
            />
            <StatBox 
              label="Overdue Payments" 
              value={`₱${paymentStats.overdue_payments}`}
              color="#F44336"
            />
            <StatBox 
              label="Collection Rate" 
              value={`${paymentStats.collection_rate}%`}
              color="#673AB7"
            />
            <StatBox 
              label="Overdue Count" 
              value={paymentStats.overdue_count}
              color="#E91E63"
            />
          </div>
        )}
      </div>

      {/* User Details Modal */}
      {selectedUser && userStats && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <button 
              onClick={() => setSelectedUser(null)}
              style={styles.closeBtn}
            >
              ✕
            </button>
            
            <h2>📊 User Details: {selectedUser.name}</h2>
            
            <div style={styles.userDetailsGrid}>
              <DetailItem label="User ID" value={selectedUser.id} />
              <DetailItem label="Email" value={selectedUser.email} />
              <DetailItem label="Plan" value={selectedUser.plan} />
              <DetailItem label="Status" value={selectedUser.status} />
              <DetailItem label="Total Sessions" value={userStats.total_sessions} />
              <DetailItem label="Sessions Today" value={userStats.sessions_today} />
              <DetailItem label="Sessions This Month" value={userStats.sessions_this_month} />
              <DetailItem label="Last Login" value={new Date(userStats.last_login).toLocaleString()} />
              <DetailItem label="Total Time Spent" value={`${userStats.total_time_spent_hours}h`} />
              <DetailItem label="Avg Session Duration" value={`${userStats.avg_session_duration_seconds}s`} />
              <DetailItem label="Engagement Level" value={userStats.engagement_level} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components
function MetricCard({ label, value, icon }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricIcon}>{icon}</div>
      <div style={styles.metricValue}>{value}</div>
      <div style={styles.metricLabel}>{label}</div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ ...styles.statBox, borderLeftColor: color }}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div style={styles.detailItem}>
      <div style={styles.detailLabel}>{label}</div>
      <div style={styles.detailValue}>{value}</div>
    </div>
  );
}

const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#f5f5f5',
    minHeight: '100vh'
  },
  title: {
    fontSize: '28px',
    marginBottom: '20px',
    color: '#333'
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#666',
    fontSize: '16px'
  },
  error: {
    padding: '20px',
    backgroundColor: '#ffebee',
    color: '#d32f2f',
    borderRadius: '4px',
    marginBottom: '20px'
  },
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '15px',
    marginBottom: '30px'
  },
  metricCard: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    textAlign: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  metricIcon: {
    fontSize: '32px',
    marginBottom: '10px'
  },
  metricValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '5px'
  },
  metricLabel: {
    fontSize: '12px',
    color: '#666'
  },
  section: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  tableContainer: {
    overflowX: 'auto',
    marginTop: '15px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px'
  },
  tableHeader: {
    backgroundColor: '#f5f5f5'
  },
  th: {
    padding: '10px',
    textAlign: 'left',
    fontWeight: 'bold',
    borderBottom: '2px solid #ddd'
  },
  td: {
    padding: '10px',
    borderBottom: '1px solid #ddd'
  },
  tableRow: {
    '&:hover': {
      backgroundColor: '#f9f9f9'
    }
  },
  btnView: {
    padding: '5px 10px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px',
    marginTop: '15px'
  },
  statBox: {
    padding: '15px',
    backgroundColor: '#f9f9f9',
    borderLeft: '4px solid #2196F3',
    borderRadius: '4px'
  },
  statLabel: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '5px'
  },
  statValue: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#2196F3'
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: 'white',
    padding: '30px',
    borderRadius: '8px',
    maxWidth: '600px',
    maxHeight: '80vh',
    overflowY: 'auto',
    boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
    position: 'relative'
  },
  closeBtn: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#666'
  },
  userDetailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '15px',
    marginTop: '20px'
  },
  detailItem: {
    padding: '10px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px'
  },
  detailLabel: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '5px'
  },
  detailValue: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#333'
  }
};

export default AdminDashboard;