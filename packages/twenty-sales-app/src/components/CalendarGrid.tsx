import { type Task } from '../api/records';
import { type CalendarCell } from '../lib/calendarGrid';
import { toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { T2 } from '../lib/strings';
import { TASK_TYPE_ICONS } from '../views/TaskView';

const WEEKDAY_HEADERS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
];

const MAX_PILLS_PER_CELL = 3;

const sortDayTasks = (tasks: Task[]): Task[] =>
  [...tasks].sort((a, b) => {
    const aDone = a.status === 'DONE';
    const bDone = b.status === 'DONE';
    if (aDone !== bDone) return aDone ? 1 : -1;
    return (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
  });

type CalendarGridProps = {
  cells: CalendarCell[];
  tasksByDate: Map<string, Task[]>;
  selectedDate: string | null;
  onSelectDay: (dateIso: string) => void;
  onDropTask: (taskId: string, newDateIso: string) => void;
};

export const CalendarGrid = ({
  cells,
  tasksByDate,
  selectedDate,
  onSelectDay,
  onDropTask,
}: CalendarGridProps) => (
  <div className="card cal-card anim d1">
    <div className="cal-grid cal-header-row">
      {WEEKDAY_HEADERS.map((label) => (
        <div key={label} className="cal-header-cell">
          {label}
        </div>
      ))}
    </div>
    <div className="cal-grid">
      {cells.map((cell) => {
        const dayTasks = sortDayTasks(tasksByDate.get(cell.dateIso) ?? []);
        const overflow = dayTasks.length - MAX_PILLS_PER_CELL;
        return (
          <div
            key={cell.key}
            className={[
              'cal-cell',
              cell.inCurrentMonth ? '' : 'muted',
              cell.isToday ? 'today' : '',
              selectedDate === cell.dateIso ? 'selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSelectDay(cell.dateIso)}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              const taskId = e.dataTransfer.getData('text/plain');
              if (taskId) onDropTask(taskId, cell.dateIso);
            }}
          >
            <span className="cal-day-num">{toPersianDigits(cell.jd)}</span>
            <div className="cal-pills">
              {dayTasks.slice(0, MAX_PILLS_PER_CELL).map((task) => {
                const TypeIcon = TASK_TYPE_ICONS[task.taskType ?? 'OTHER'];
                return (
                  <div
                    key={task.id}
                    className={`cal-pill ${task.status === 'DONE' ? 'done' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', task.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/task/${task.id}`);
                    }}
                  >
                    <TypeIcon size={11} />
                    <span className="cal-pill-title">{task.title}</span>
                  </div>
                );
              })}
              {overflow > 0 && (
                <span className="cal-overflow">
                  +{toPersianDigits(overflow)} {T2.calendarMore}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
