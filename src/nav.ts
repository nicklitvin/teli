import { createContext, useContext } from 'react';

export interface Nav {
  openDetail(id: string): void;
  openRate(id: string): void;
  openProfile(): void;
  /** A short message above the tab bar, optionally with an Undo button. */
  notify(text: string, undo?: () => void): void;
}

export const NavCtx = createContext<Nav>({ openDetail() {}, openRate() {}, openProfile() {}, notify() {} });
export const useNav = () => useContext(NavCtx);
