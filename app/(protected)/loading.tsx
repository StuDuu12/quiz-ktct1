"use client";

import { CircleNotch } from "@phosphor-icons/react";

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px' }}>
      <CircleNotch 
        size={40} 
        weight="bold" 
        color="var(--ktct-primary, #3b82f6)" 
        className="animate-spin" 
        style={{ animation: 'spin 1s linear infinite' }} 
      />
      <p style={{ color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Đang tải dữ liệu...</p>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
