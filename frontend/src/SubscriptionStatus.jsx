import React, { useState, useEffect } from 'react';

function SubscriptionStatus() {
  const [subscription, setSubscription] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      // Get current user ID (adjust based on your auth system)
      const userId = localStorage.getItem('userId') || 'current-user';
      
      const res = await fetch(`/api/payments/subscription/user/${userId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      setError(error.message);
      setLoading(false);
    }
  };

  const getToken = () => {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  };

  const handleGCashPayment = async () => {
    try {
      if (!subscription) {
        alert('Subscription not found');
        return;
      }

      // Create payment record
      const paymentRes = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          amount: subscription.amount || 599,
          method: 'gcash'
        })
      });

      if (!paymentRes.ok) {
        throw new Error('Failed to create payment');
      }

      const paymentData = await paymentRes.json();
      setPayment(paymentData);

      // Attempt to open GCash app with deep link
      const amount = subscription?.amount || 599;
      const deepLink = `gcash://pay?amount=${amount}&reference=${paymentData.reference_number}`;

      // Check if on mobile
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.location.href = deepLink;
      } else {
        // On desktop, open GCash website
        window.open('https://www.gcash.com/app', '_blank');
      }

      alert(`Payment initiated!\nAmount: ₱${amount}\nReference: ${paymentData.reference_number}\n\nAfter payment, come back to confirm.`);
    } catch (error) {
      console.error('Payment error:', error);
      alert('Error: ' + error.message);
    }
  };

  const handlePayMayaPayment = async () => {
    try {
      if (!subscription) {
        alert('Subscription not found');
        return;
      }
      const paymentRes = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          amount: subscription.amount || 599,
          method: 'paymaya'
        })
      });

      const paymentData = await paymentRes.json();
      setPayment(paymentData);

      window.open('https://www.paymaya.com', '_blank');
      alert(`Payment initiated!\nAmount: ₱${subscription?.amount || 599}\nReference: ${paymentData.reference_number}`);
    } catch (error) {
      console.error('PayMaya payment error:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleBankTransfer = async () => {
    try {
      if (!subscription) {
        alert('Subscription not found');
        return;
      }
      const paymentRes = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          amount: subscription.amount || 599,
          method: 'bank_transfer'
        })
      });

      const paymentData = await paymentRes.json();
      setPayment(paymentData);

      alert(`Bank Transfer Details:\n\nBank: BDO\nAccount: KAIMAN & CO\nAmount: ₱${subscription.amount || 599}\nReference: ${paymentData.reference_number}\n\nPlease upload proof of payment after transfer.`);
    } catch (error) {
      console.error('Bank transfer error:', error);
      alert('Error: ' + error.message);
    }
  };

  if (loading) return <div style={styles.loading}>Loading subscription...</div>;
  if (error) return <div style={styles.error}>Error: {error}</div>;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>💳 Subscription Status</h2>

        {subscription && (
          <div style={styles.info}>
            <p><strong>Plan:</strong> {subscription.plan || 'Standard'}</p>
            <p><strong>Amount:</strong> ₱{subscription.amount || 599}/month</p>
            <p><strong>Due Date:</strong> {new Date(subscription.due_date).toLocaleDateString()}</p>
            <p><strong>Status:</strong> {subscription.status === 'active' ? '✅ Active' : '❌ Expired'}</p>
          </div>
        )}

        {subscription?.status !== 'active' && (
          <div style={styles.alert}>
            ⚠️ Your subscription has expired. Please renew to continue.
          </div>
        )}

        <div style={styles.buttons}>
          <button onClick={handleGCashPayment} style={styles.btnGCash}>
            💚 Pay with GCash
          </button>
          <button onClick={handlePayMayaPayment} style={styles.btnPayMaya}>
            💳 Pay with PayMaya
          </button>
          <button onClick={handleBankTransfer} style={styles.btnBank}>
            🏦 Bank Transfer
          </button>
        </div>

        {payment && payment.status === 'pending' && (
          <div style={styles.pending}>
            ⏳ Payment pending... ({payment.reference_number})
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '20px',
    maxWidth: '600px'
  },
  card: {
    border: '1px solid #ddd',
    padding: '20px',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  title: {
    marginTop: 0,
    color: '#333'
  },
  info: {
    marginBottom: '15px',
    fontSize: '14px',
    lineHeight: '1.8'
  },
  alert: {
    backgroundColor: '#fff3cd',
    padding: '10px',
    borderRadius: '4px',
    color: '#856404',
    marginBottom: '15px',
    fontSize: '14px'
  },
  buttons: {
    display: 'flex',
    gap: '10px',
    marginBottom: '15px',
    flexWrap: 'wrap'
  },
  btnGCash: {
    flex: 1,
    padding: '10px 15px',
    backgroundColor: '#00B0E9',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold'
  },
  btnPayMaya: {
    flex: 1,
    padding: '10px 15px',
    backgroundColor: '#0066FF',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold'
  },
  btnBank: {
    flex: 1,
    padding: '10px 15px',
    backgroundColor: '#666',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold'
  },
  pending: {
    color: '#0066cc',
    fontSize: '12px',
    backgroundColor: '#e6f2ff',
    padding: '8px',
    borderRadius: '4px'
  },
  loading: {
    padding: '20px',
    textAlign: 'center',
    color: '#666'
  },
  error: {
    padding: '20px',
    textAlign: 'center',
    color: '#d32f2f',
    backgroundColor: '#ffebee',
    borderRadius: '4px'
  }
};

export default SubscriptionStatus;