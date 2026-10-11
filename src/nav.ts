import { createContext, useContext } from 'react';

export interface Nav {
  openDetail(id: string): void;
  openRate(id: string): void;
}

export const NavCtx = createContext<Nav>({ openDetail() {}, openRate() {} });
export const useNav = () => useContext(NavCtx);
