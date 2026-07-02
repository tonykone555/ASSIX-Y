import React, { useState, useRef } from 'react';
import { Trash2 } from 'lucide-react';

interface SwipeableTaskItemProps {
  onDelete: () => void;
  onClick: () => void;
  isActive: boolean;
  children: React.ReactNode;
}

export const SwipeableTaskItem: React.FC<SwipeableTaskItemProps> = ({
  onDelete,
  onClick,
  isActive,
  children
}) => {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const startX = useRef(0);
  const dragDistance = useRef(0);

  // Constants
  const MAX_DRAG = -120; // Left drag limit
  const TRIGGER_DRAG = -65; // Offset where delete button stays visible or triggers delete

  const handleStart = (clientX: number) => {
    startX.current = clientX;
    setIsDragging(true);
    dragDistance.current = 0;
  };

  const handleMove = (clientX: number) => {
    if (!isDragging) return;
    const deltaX = clientX - startX.current;
    dragDistance.current = Math.abs(deltaX);

    // Only allow swiping to the left (negative values) or returning to 0
    let targetOffset = showDelete ? TRIGGER_DRAG + deltaX : deltaX;
    if (targetOffset > 0) targetOffset = 0;
    if (targetOffset < MAX_DRAG) {
      // Add rubberband effect
      const excess = targetOffset - MAX_DRAG;
      targetOffset = MAX_DRAG + excess * 0.25;
    }

    setDragOffset(targetOffset);
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // If drag distance was very small, treat as a pure click
    if (dragDistance.current < 8) {
      onClick();
      setDragOffset(0);
      setShowDelete(false);
      return;
    }

    if (dragOffset < -95) {
      // Expose full delete button
      setShowDelete(true);
      setDragOffset(TRIGGER_DRAG);
    } else if (dragOffset < TRIGGER_DRAG / 2) {
      // Show the delete button
      setShowDelete(true);
      setDragOffset(TRIGGER_DRAG);
    } else {
      // Reset
      setShowDelete(false);
      setDragOffset(0);
    }
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    handleEnd();
  };

  // Mouse handlers for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    // If clicking a button directly, don't drag
    if ((e.target as HTMLElement).closest('button')) return;
    
    handleStart(e.clientX);
    
    const handleGlobalMouseMove = (moveEvent: MouseEvent) => {
      handleMove(moveEvent.clientX);
    };

    const handleGlobalMouseUp = () => {
      handleEnd();
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
    setShowDelete(false);
    setDragOffset(0);
  };

  return (
    <div className="relative overflow-hidden rounded select-none group w-full">
      {/* Background Delete Button Layer */}
      <div 
        onClick={handleConfirmDelete}
        className="absolute inset-y-0 right-0 bg-red-600 hover:bg-red-500 flex items-center justify-center cursor-pointer transition-colors duration-150 z-0"
        style={{ width: `${Math.abs(dragOffset)}px`, minWidth: showDelete ? '65px' : '0px' }}
      >
        <div className="flex flex-col items-center justify-center text-white px-2 gap-0.5">
          <Trash2 size={12} className="animate-pulse" />
          {Math.abs(dragOffset) > 45 && (
            <span className="text-[7px] font-bold tracking-widest uppercase">DELETE</span>
          )}
        </div>
      </div>

      {/* Swipeable Foreground item */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        style={{
          transform: `translateX(${dragOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        className="w-full relative z-10"
      >
        {children}
      </div>
    </div>
  );
};
