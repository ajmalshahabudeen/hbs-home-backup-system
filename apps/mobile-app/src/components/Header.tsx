import React from 'react';

export interface HeaderProps {
  title?: string;
  onOpenServerScanner?: () => void;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = () => {
  return null;
};
