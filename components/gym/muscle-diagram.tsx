'use client';

// SVG-based muscle group highlight diagrams
const MUSCLE_PATHS: Record<string, { label: string; color: string; emoji: string }> = {
  chest: { label: 'Chest', color: '#ef4444', emoji: '💪' },
  back: { label: 'Back', color: '#3b82f6', emoji: '🪴' },
  legs: { label: 'Legs', color: '#22c55e', emoji: '🦵' },
  shoulders: { label: 'Shoulders', color: '#f59e0b', emoji: '🏋️' },
  arms: { label: 'Arms', color: '#8b5cf6', emoji: '💪' },
  core: { label: 'Core', color: '#ec4899', emoji: '🫨' },
  cardio: { label: 'Cardio', color: '#ef4444', emoji: '❤️' },
  full_body: { label: 'Full Body', color: '#f97316', emoji: '🔥' },
};

export function MuscleGroupBadge({ muscleGroup, size = 'md' }: { muscleGroup: string; size?: 'sm' | 'md' | 'lg' }) {
  const data = MUSCLE_PATHS[muscleGroup] || { label: muscleGroup, color: '#6b7280', emoji: '🏋️' };
  const sizeClasses = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-2xl';

  return (
    <div
      className={`${sizeClasses} rounded-xl flex items-center justify-center flex-shrink-0`}
      style={{ backgroundColor: `${data.color}15`, border: `1px solid ${data.color}30` }}
    >
      <span className={textSize}>{data.emoji}</span>
    </div>
  );
}

export function ExerciseThumbnail({ exercise, size = 'md' }: { exercise: any; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-20 h-20' : 'w-14 h-14';

  if (exercise.imageUrl) {
    return (
      <div className={`${sizeClasses} rounded-xl overflow-hidden bg-secondary flex-shrink-0`}>
        <img
          src={exercise.imageUrl}
          alt={exercise.name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    );
  }

  return <MuscleGroupBadge muscleGroup={exercise.muscleGroup} size={size} />;
}
