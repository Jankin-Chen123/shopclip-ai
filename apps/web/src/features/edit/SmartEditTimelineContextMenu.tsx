interface SmartEditTimelineContextMenuProps {
  x: number;
  y: number;
  onAddBookmark: () => void;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSplitAtPlayhead: () => void;
}

export const SmartEditTimelineContextMenu = ({
  x,
  y,
  onAddBookmark,
  onClose,
  onCopy,
  onDelete,
  onDuplicate,
  onSplitAtPlayhead,
}: SmartEditTimelineContextMenuProps) => {
  const runAndClose = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      className="smart-edit-context-menu"
      role="menu"
      style={{
        left: x,
        top: y,
      }}
    >
      <button role="menuitem" type="button" onClick={() => runAndClose(onSplitAtPlayhead)}>
        Split at playhead
      </button>
      <button role="menuitem" type="button" onClick={() => runAndClose(onDuplicate)}>
        Duplicate
      </button>
      <button role="menuitem" type="button" onClick={() => runAndClose(onCopy)}>
        Copy
      </button>
      <button role="menuitem" type="button" onClick={() => runAndClose(onAddBookmark)}>
        Add bookmark
      </button>
      <button role="menuitem" type="button" onClick={() => runAndClose(onDelete)}>
        Delete
      </button>
      <button role="menuitem" type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
};
