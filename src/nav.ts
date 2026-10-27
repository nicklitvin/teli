import { createContext, useContext } from 'react';

export interface Nav {
  openDetail(id: string): void;
  openRate(id: string): void;
  /** Walk through the titles carried over from the old rankings; `intro` explains why first. */
  openReview(intro?: boolean): void;
  /** A short message near the top of the screen, optionally with an Undo button. */
  notify(text: string, undo?: () => void): void;
}

export const NavCtx = createContext<Nav>({ openDetail() {}, openRate() {}, openReview() {}, notify() {} });
export const useNav = () => useContext(NavCtx);
