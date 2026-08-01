"use client";

import { CircleNotch } from "@phosphor-icons/react";

export default function PracticeLoading() {
  return (
    <main className="practice-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f8fafc' }}>
      <header className="practice-header" style={{ padding: '0 24px', display: 'flex', alignItems: 'center', height: '64px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
          <div style={{ width: '24px', height: '24px', backgroundColor: '#e2e8f0', borderRadius: '4px' }}></div>
          <div style={{ width: '120px', height: '20px', backgroundColor: '#e2e8f0', borderRadius: '4px' }}></div>
        </div>
      </header>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <CircleNotch size={48} weight="bold" color="var(--ktct-primary)" className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#64748b', fontSize: '16px', fontWeight: 500 }}>Đang chuẩn bị lượt luyện tập...</p>
        </div>
      </div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
