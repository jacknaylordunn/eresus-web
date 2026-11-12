import React from "react";
import { XSquare } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div
      // On a phone it rises from the bottom like an iOS sheet, leaving the clock and ring in view; on a wider
      // screen it sits in the middle.
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md mx-auto overflow-hidden flex flex-col max-h-[85vh] max-h-[85dvh] pb-[env(safe-area-inset-bottom)] motion-safe:animate-in motion-safe:slide-in-from-bottom-8 motion-safe:duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-600 sm:hidden" aria-hidden="true" />
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-m-2 p-2 min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <XSquare size={24} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
