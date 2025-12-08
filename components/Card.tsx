import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div className={`bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-xl p-6 shadow-xl ${className}`} {...props}>
      {children}
    </div>
  );
};