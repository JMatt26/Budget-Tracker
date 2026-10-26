import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import React from "react";
import { TransactionForm } from "../../features/transactions/TransactionForm";
import type { Transaction } from "../../lib/types";

type QuickAddValue = {
  // Opens the transaction sheet; pass a transaction to edit it instead.
  openTransaction: (transaction?: Transaction | null) => void;
};

const QuickAddContext = createContext<QuickAddValue | undefined>(undefined);

export const QuickAddProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const openTransaction = useCallback((transaction?: Transaction | null) => {
    setEditing(transaction ?? null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setEditing(null);
  }, []);

  // "N" anywhere outside a text field opens a new transaction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openTransaction(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTransaction]);

  return (
    <QuickAddContext.Provider value={{ openTransaction }}>
      {children}
      {open && <TransactionForm transaction={editing} onClose={close} />}
    </QuickAddContext.Provider>
  );
};

export const useQuickAdd = () => {
  const ctx = useContext(QuickAddContext);
  if (!ctx) {
    throw new Error("useQuickAdd must be used within QuickAddProvider");
  }
  return ctx;
};
