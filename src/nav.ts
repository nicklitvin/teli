import { createContext, useContext } from 'react';

export interface Nav {
  openDetail(id: string): void;
  openRate(id: string): void;
  openProfile(): void;
}

export const NavCtx = createContext<Nav>({ openDetail() {}, openRate() {}, openProfile() {} });
export const useNav = () => useContext(NavCtx);
