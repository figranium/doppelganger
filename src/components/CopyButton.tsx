import React, { useState } from "react";
import MaterialIcon from "./MaterialIcon";
import { copyToClipboard } from "../utils/clipboard";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  iconClassName?: string;
  onCopy?: () => void;
  title?: string;
  disabled?: boolean;
}

const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label,
  className,
  iconClassName,
  onCopy,
  title,
  disabled = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const defaultClassName = "flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all text-[9px] font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed";
  const focusClasses = "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50";
  const resolvedClass = className ? `${className} ${focusClasses}` : `${defaultClassName} ${focusClasses}`;
  const finalClass = copied ? resolvedClass.replace('border-white/10', 'border-green-400 text-green-400') : resolvedClass;

  return (
    <button
      onClick={handleCopy}
      disabled={disabled}
      className={finalClass}
      title={title || (copied ? "Copied" : "Copy")}
      type="button"
      aria-label={label || title || "Copy to clipboard"}
    >
      {copied ? (
        <MaterialIcon
          name="check"
          className={`${iconClassName || "text-sm"} text-green-400`}
        />
      ) : (
        <MaterialIcon
          name="content_copy"
          className={iconClassName || "text-sm"}
        />
      )}
      {label && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
};

export default CopyButton;
