import { useState, useMemo, Fragment } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Router as WouterRouter } from "wouter";
import { 
  Calendar, Users, AlertTriangle, CheckCircle2, Plus, Trash2, 
  Calculator, X, UserPlus, Building, Clock, ChevronRight, Info, 
  Sparkles, Store, UserCheck, FileSpreadsheet, AlertCircle, 
  Database, RefreshCw, ChevronLeft
} from "lucide-react";

const queryClient = new QueryClient();

// Static Data Definitions
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS = [
  { id: 1, name: "Slot 1 (12 PM - 5 PM)", time: "12:00 - 17:00" },
  { id: 2, name: "Slot 2 (5 PM - 10 PM)", time: "17:00 - 22:00" }
];

const DEFAULT_EMPLOYEES = [
  { id: "alim", name: "Alim", maxShifts: 2, color: "emerald", shiftRate: 250 },
  { id: "masum", name: "Masum", maxShifts: 7, color: "indigo", shiftRate: 250 },
  { id: "minhaj", name: "Minhaj", maxShifts: 6, color: "violet", shiftRate: 250 }
];

const DEFAULT_SHOPS = ["Shop 1", "Shop 2", "Shop 3"];

const COLOR_MAPS: Record<string, { bg: string, text: string, fill: string, hover: string }> = {
  emerald: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "text-emerald-700", fill: "bg-emerald-500", hover: "hover:bg-emerald-50" },
  indigo: { bg: "bg-indigo-50 text-indigo-700 border-indigo-200", text: "text-indigo-700", fill: "bg-indigo-500", hover: "hover:bg-indigo-50" },
  violet: { bg: "bg-violet-50 text-violet-700 border-violet-200", text: "text-violet-700", fill: "bg-violet-500", hover: "hover:bg-violet-50" },
  rose: { bg: "bg-rose-50 text-rose-700 border-rose-200", text: "text-rose-700", fill: "bg-rose-500", hover: "hover:bg-rose-50" },
  amber: { bg: "bg-amber-50 text-amber-700 border-amber-200", text: "text-amber-700", fill: "bg-amber-500", hover: "hover:bg-amber-50" },
  sky: { bg: "bg-sky-50 text-sky-700 border-sky-200", text: "text-sky-700", fill: "bg-sky-500", hover: "hover:bg-sky-50" },
  orange: { bg: "bg-orange-50 text-orange-700 border-orange-200", text: "text-orange-700", fill: "bg-orange-500", hover: "hover:bg-orange-50" },
  slate: { bg: "bg-slate-100 text-slate-700 border-slate-200", text: "text-slate-700", fill: "bg-slate-500", hover: "hover:bg-slate-100" }
};

interface Employee { id: string; name: string; maxShifts: number; color: string; shiftRate: number; }
interface SlotDetails { name: string; time: string; }
type SlotsConfig = Record<string, Record<number, SlotDetails>>;
type Schedule = Record<string, Record<string, Record<number, string | null>>>;
type Attendance = Record<string, Record<string, { status: string; multiplier: number }>>;

const STORAGE_KEYS = {
  employees: "roster_employees",
  shops: "roster_shops", 
  schedule: "roster_schedule",
  attendance: "roster_attendance",
  slotsConfig: "roster_slots_config",
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const toYMD = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getDayName = (dateString: string) => {
  const [y, m, d] = dateString.split("-");
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return date.toLocaleDateString("en-US", { weekday: "long" });
};

const getMonthName = (dateString: string) => {
  const [y, m, d] = dateString.split("-");
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const getDatesInWeek = (dateString: string) => {
  const [y, m, d] = dateString.split("-");
  const curr = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const dayOfWeek = curr.getDay(); // 0 is Sunday, 1 is Monday
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Offset to get to Monday
  curr.setDate(curr.getDate() - offset);
  
  const week = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(curr);
    date.setDate(curr.getDate() + i);
    week.push(toYMD(date));
  }
  return week;
};

const getDatesInMonth = (dateString: string) => {
  const [y, m, d] = dateString.split("-");
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const numDays = new Date(year, month, 0).getDate();
  
  const monthDates = [];
  for (let i = 1; i <= numDays; i++) {
    const date = new Date(year, month - 1, i);
    monthDates.push(toYMD(date));
  }
  return monthDates;
};

function RosterPlanner() {
  const [syncStatus, setSyncStatus] = useState("Local Mode");
  const dbLoading = false;

  const [employees, setEmployees] = useState<Employee[]>(() => loadFromStorage(STORAGE_KEYS.employees, DEFAULT_EMPLOYEES));
  const [shops, setShops] = useState<string[]>(() => loadFromStorage(STORAGE_KEYS.shops, DEFAULT_SHOPS));
  const [schedule, setSchedule] = useState<Schedule>(() => loadFromStorage(STORAGE_KEYS.schedule, {}));
  const [attendance, setAttendance] = useState<Attendance>(() => loadFromStorage(STORAGE_KEYS.attendance, {}));
  const [slotsConfig, setSlotsConfig] = useState<SlotsConfig>(() => loadFromStorage(STORAGE_KEYS.slotsConfig, {}));

  const [avgWeeklyDays, setAvgWeeklyDays] = useState(3);
  const [activeTab, setActiveTab] = useState("scheduler");
  const [selectedDate, setSelectedDate] = useState(toYMD(new Date()));
  const [payrollViewMode, setPayrollViewMode] = useState("daily");

  const [showAddEmp, setShowAddEmp] = useState(false);
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpShifts, setNewEmpShifts] = useState(3);
  const [newEmpColor, setNewEmpColor] = useState("rose");
  const [newEmpRate, setNewEmpRate] = useState(250);

  const [newShopName, setNewShopName] = useState("");
  const [shopError, setShopError] = useState("");

  const [editingShopSlots, setEditingShopSlots] = useState<string | null>(null);
  const [slot1NameInput, setSlot1NameInput] = useState("");
  const [slot1TimeInput, setSlot1TimeInput] = useState("");
  const [slot2NameInput, setSlot2NameInput] = useState("");
  const [slot2TimeInput, setSlot2TimeInput] = useState("");

  const [selectedCell, setSelectedCell] = useState<{day: string, shop: string, slotId: number} | null>(null);

  const getSlotDetails = (shop: string, slotId: number) => {
    if (slotsConfig && slotsConfig[shop] && slotsConfig[shop][slotId]) {
      return slotsConfig[shop][slotId];
    }
    const fallback = SLOTS.find(s => s.id === slotId);
    return {
      name: fallback ? fallback.name : `Slot ${slotId}`,
      time: fallback ? fallback.time : ""
    };
  };

  const persistRoster = async (updatedEmployees: Employee[], updatedShops: string[], updatedSlotsConfig: SlotsConfig) => {
    setSyncStatus("Saving...");
    saveToStorage(STORAGE_KEYS.employees, updatedEmployees);
    saveToStorage(STORAGE_KEYS.shops, updatedShops);
    saveToStorage(STORAGE_KEYS.slotsConfig, updatedSlotsConfig || slotsConfig);
    setSyncStatus("Saved");
  };

  const persistSchedule = async (updatedSchedule: Schedule) => {
    setSyncStatus("Saving...");
    saveToStorage(STORAGE_KEYS.schedule, updatedSchedule);
    setSyncStatus("Saved");
  };

  const persistAttendance = async (updatedAttendance: Attendance) => {
    setSyncStatus("Saving...");
    saveToStorage(STORAGE_KEYS.attendance, updatedAttendance);
    setSyncStatus("Saved");
  };

  // Helper properties
  const TOTAL_SLOTS_NEEDED = useMemo(() => {
    return shops.length * DAYS.length * SLOTS.length;
  }, [shops]);

  const currentTeamCapacity = useMemo(() => {
    return employees.reduce((sum, emp) => sum + Number(emp.maxShifts), 0);
  }, [employees]);

  const deficitSlots = useMemo(() => {
    return Math.max(0, TOTAL_SLOTS_NEEDED - currentTeamCapacity);
  }, [TOTAL_SLOTS_NEEDED, currentTeamCapacity]);

  const estimatedHiresNeeded = useMemo(() => {
    if (avgWeeklyDays <= 0) return 0;
    return Math.ceil(deficitSlots / avgWeeklyDays);
  }, [deficitSlots, avgWeeklyDays]);

  // Calculate current shift counts assigned in the weekly template
  const currentAssignedStats = useMemo(() => {
    const stats: Record<string, number> = {};
    employees.forEach(emp => { stats[emp.id] = 0; });
    
    let totalAssigned = 0;
    Object.values(schedule).forEach(daySched => {
      Object.values(daySched).forEach(shopSched => {
        Object.values(shopSched).forEach(empId => {
          if (empId) {
            stats[empId] = (stats[empId] || 0) + 1;
            totalAssigned++;
          }
        });
      });
    });

    return { stats, totalAssigned };
  }, [schedule, employees]);

  const scheduleConflicts = useMemo(() => {
    const conflicts: any[] = [];
    DAYS.forEach(day => {
      SLOTS.forEach(slot => {
        const assignmentsOnThisSlot: Record<string, any[]> = {};
        shops.forEach(shop => {
          const assignedId = schedule[day]?.[shop]?.[slot.id];
          if (assignedId) {
            if (!assignmentsOnThisSlot[assignedId]) {
              assignmentsOnThisSlot[assignedId] = [];
            }
            assignmentsOnThisSlot[assignedId].push(shop);
          }
        });
        Object.entries(assignmentsOnThisSlot).forEach(([empId, assignedShops]) => {
          if (assignedShops.length > 1) {
            conflicts.push({
              day, slotId: slot.id, slotName: slot.name,
              empName: employees.find(e => e.id === empId)?.name || 'Unknown',
              shops: assignedShops
            });
          }
        });
      });
    });
    return conflicts;
  }, [schedule, employees, shops]);

  const dynamicAvailability = useMemo(() => {
    if (!selectedCell) return { available: [], atCapacity: [], doubleBooked: [] };
    const { day, shop, slotId } = selectedCell;

    const available: any[] = [];
    const atCapacity: any[] = [];
    const doubleBooked: any[] = [];

    employees.forEach(emp => {
      const currentShifts = currentAssignedStats.stats[emp.id] || 0;
      const isCurrentlyAssignedToThisCell = schedule[day]?.[shop]?.[slotId] === emp.id;
      
      const adjustedAssignedCount = isCurrentlyAssignedToThisCell ? currentShifts - 1 : currentShifts;
      const reachedCapacity = adjustedAssignedCount >= emp.maxShifts;

      const isBookedElsewhereThisSlot = Object.keys(schedule[day] || {}).some(otherShop => {
        if (otherShop === shop) return false;
        return schedule[day]?.[otherShop]?.[slotId] === emp.id;
      });

      const processedEmployee = {
        ...emp, currentShifts, isCurrentlyAssignedToThisCell, reachedCapacity, isBookedElsewhereThisSlot
      };

      if (isBookedElsewhereThisSlot) {
        doubleBooked.push(processedEmployee);
      } else if (reachedCapacity) {
        atCapacity.push(processedEmployee);
      } else {
        available.push(processedEmployee);
      }
    });

    return { available, atCapacity, doubleBooked };
  }, [selectedCell, employees, schedule, currentAssignedStats]);

  // ==========================================
  // UNIFIED PAYROLL & ATTENDANCE ENGINE
  // ==========================================
  
  // 1. Determine active exact date range based on view mode
  const activeDateRange = useMemo(() => {
    if (payrollViewMode === 'daily') return [selectedDate];
    if (payrollViewMode === 'weekly') return getDatesInWeek(selectedDate);
    if (payrollViewMode === 'monthly') return getDatesInMonth(selectedDate);
    return [selectedDate];
  }, [selectedDate, payrollViewMode]);

  // 2. Scan exact dates for real-time ledger outputs
  const unifiedLedger = useMemo(() => {
    const summary: Record<string, any> = {};
    employees.forEach(emp => {
      summary[emp.id] = {
        ...emp,
        assignedShifts: 0, // Expected Template Shifts
        presentCount: 0,
        lateCount: 0,
        absentCount: 0,
        totalShiftsWorked: 0,
        payout: 0,
        shiftsWorked: [], // List of details for rendering daily view context
      };
    });

    activeDateRange.forEach(dateStr => {
      const dayOfWeek = getDayName(dateStr); // "Monday" -> ties back to the schedule template
      
      shops.forEach(shop => {
        SLOTS.forEach(slot => {
          // Check if staff was expected to work this day of the week
          const empId = schedule[dayOfWeek]?.[shop]?.[slot.id];
          if (empId && summary[empId]) {
            summary[empId].assignedShifts++;
            
            // Check Database for overrides on this EXACT date
            const attKey = `${shop}-${slot.id}`;
            const record = attendance[dateStr]?.[attKey];
            
            let shiftMultiplier = 1.0;
            let shiftStatus = 'Present';

            if (record) {
              shiftStatus = record.status;
              shiftMultiplier = record.status === 'Absent' ? 0 : record.multiplier;
            }

            // Apply metrics to Ledger totals
            if (shiftStatus !== 'Absent') {
              summary[empId].totalShiftsWorked += shiftMultiplier;
              summary[empId].payout += shiftMultiplier * summary[empId].shiftRate;
              
              if (payrollViewMode === 'daily') {
                const currentSlotDetails = getSlotDetails(shop, slot.id);
                summary[empId].shiftsWorked.push(`${shop} (${currentSlotDetails.name})`);
              }
            }

            // Tally status totals
            if (shiftStatus === 'Present') summary[empId].presentCount++;
            else if (shiftStatus === 'Late') summary[empId].lateCount++;
            else if (shiftStatus === 'Absent') summary[empId].absentCount++;
          }
        });
      });
    });

    // Formatting outputs to 1 decimal place safely
    Object.keys(summary).forEach(id => {
      summary[id].totalShiftsWorked = Math.round(summary[id].totalShiftsWorked * 10) / 10;
      summary[id].payout = Math.round(summary[id].payout);
    });

    return Object.values(summary);
  }, [employees, schedule, attendance, shops, activeDateRange, slotsConfig, payrollViewMode]);

  // Aggregate Payroll Card Statistics from Unified Ledger
  const payrollStats = useMemo(() => {
    let totalPayroll = 0;
    let totalShiftsWorked = 0;
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;

    unifiedLedger.forEach(emp => {
      totalPayroll += emp.payout;
      totalShiftsWorked += emp.totalShiftsWorked;
      presentCount += emp.presentCount;
      lateCount += emp.lateCount;
      absentCount += emp.absentCount;
    });

    return { 
      totalPayroll: Math.round(totalPayroll), 
      totalShiftsWorked: Math.round(totalShiftsWorked * 10) / 10, 
      presentCount, 
      lateCount, 
      absentCount 
    };
  }, [unifiedLedger]);

  // Generate exact scheduled checks for the Selected Calendar Day
  const activeDailyAttendanceShifts = useMemo(() => {
    const list: any[] = [];
    const dayOfWeek = getDayName(selectedDate);

    shops.forEach(shop => {
      SLOTS.forEach(slot => {
        const empId = schedule[dayOfWeek]?.[shop]?.[slot.id];
        if (empId) {
          const emp = employees.find(e => e.id === empId);
          if (emp) {
            const attKey = `${shop}-${slot.id}`;
            const attRecord = attendance[selectedDate]?.[attKey] || { status: 'Present', multiplier: 1.0 };
            list.push({
              shop,
              slot,
              emp,
              status: attRecord.status,
              multiplier: attRecord.multiplier
            });
          }
        }
      });
    });
    return list;
  }, [schedule, selectedDate, employees, shops, attendance]);

  // Date Shifter Utility function
  const shiftSelectedDate = (daysToAdd: number) => {
    const [y, m, d] = selectedDate.split('-');
    const curr = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    curr.setDate(curr.getDate() + daysToAdd);
    setSelectedDate(toYMD(curr));
  };

  // Handle Attendance DB Commit
  const handleUpdateAttendance = (dateStr: string, shop: string, slotId: number, status: string, multiplier: number) => {
    const key = `${shop}-${slotId}`;
    const dayData = attendance[dateStr] || {};
    const updatedDayData = {
      ...dayData,
      [key]: { status, multiplier: Number(multiplier) }
    };
    const updatedAttendance = {
      ...attendance,
      [dateStr]: updatedDayData
    };
    
    setAttendance(updatedAttendance);
    persistAttendance(updatedAttendance);
  };

  // --- COMPONENT HANDLERS ---
  const handleOpenEditSlots = (shop: string) => {
    const s1 = getSlotDetails(shop, 1);
    const s2 = getSlotDetails(shop, 2);
    setEditingShopSlots(shop);
    setSlot1NameInput(s1.name);
    setSlot1TimeInput(s1.time);
    setSlot2NameInput(s2.name);
    setSlot2TimeInput(s2.time);
  };

  const handleSaveShopSlots = async (e: any) => {
    e.preventDefault();
    if (!editingShopSlots) return;

    const updatedSlotsConfig = {
      ...slotsConfig,
      [editingShopSlots]: {
        1: { name: slot1NameInput.trim() || 'Slot 1', time: slot1TimeInput.trim() },
        2: { name: slot2NameInput.trim() || 'Slot 2', time: slot2TimeInput.trim() }
      }
    };

    setSlotsConfig(updatedSlotsConfig);
    await persistRoster(employees, shops, updatedSlotsConfig);
    setEditingShopSlots(null);
  };

  const handleAddEmployee = (e: any) => {
    e.preventDefault();
    if (!newEmpName.trim()) return;

    const newId = newEmpName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const updatedEmployees = [
      ...employees,
      {
        id: newId,
        name: newEmpName,
        maxShifts: Math.max(1, Math.min(7, Number(newEmpShifts))),
        color: newEmpColor,
        shiftRate: Number(newEmpRate) || 250
      }
    ];

    setEmployees(updatedEmployees);
    persistRoster(updatedEmployees, shops, slotsConfig);

    setNewEmpName('');
    setNewEmpShifts(3);
    setNewEmpRate(250);
    setShowAddEmp(false);
  };

  const handleUpdateMaxShifts = (id: string, newMax: number) => {
    const clampedMax = Math.max(1, Math.min(7, newMax));
    const updatedEmployees = employees.map(emp => {
      if (emp.id === id) {
        return { ...emp, maxShifts: clampedMax };
      }
      return emp;
    });
    setEmployees(updatedEmployees);
    persistRoster(updatedEmployees, shops, slotsConfig);
  };

  const handleUpdateShiftRate = (id: string, newRate: number) => {
    const clampedRate = Math.max(50, Math.min(5000, newRate));
    const updatedEmployees = employees.map(emp => {
      if (emp.id === id) {
        return { ...emp, shiftRate: clampedRate };
      }
      return emp;
    });
    setEmployees(updatedEmployees);
    persistRoster(updatedEmployees, shops, slotsConfig);
  };

  const handleDeleteEmployee = (id: string) => {
    const updatedEmployees = employees.filter(emp => emp.id !== id);
    setEmployees(updatedEmployees);

    const updatedSchedule = { ...schedule };
    DAYS.forEach(day => {
      if (updatedSchedule[day]) {
        shops.forEach(shop => {
          if (updatedSchedule[day][shop]) {
            SLOTS.forEach(slot => {
              if (updatedSchedule[day][shop][slot.id] === id) {
                delete updatedSchedule[day][shop][slot.id];
              }
            });
          }
        });
      }
    });

    setSchedule(updatedSchedule);
    persistRoster(updatedEmployees, shops, slotsConfig);
    persistSchedule(updatedSchedule);
  };

  const handleAddShop = (e: any) => {
    e.preventDefault();
    const formattedName = newShopName.trim();
    if (!formattedName) return;

    if (shops.some(s => s.toLowerCase() === formattedName.toLowerCase())) {
      setShopError('A shop with this name already exists.');
      return;
    }

    const updatedShops = [...shops, formattedName];
    setShops(updatedShops);
    persistRoster(employees, updatedShops, slotsConfig);

    setNewShopName('');
    setShopError('');
  };

  const handleDeleteShop = (shopToDelete: string) => {
    if (shops.length <= 1) {
      alert("You must have at least one shop configured.");
      return;
    }

    const updatedShops = shops.filter(shop => shop !== shopToDelete);
    setShops(updatedShops);

    const updatedSlotsConfig = { ...slotsConfig };
    delete updatedSlotsConfig[shopToDelete];
    setSlotsConfig(updatedSlotsConfig);

    const updatedSchedule = { ...schedule };
    DAYS.forEach(day => {
      if (updatedSchedule[day] && updatedSchedule[day][shopToDelete]) {
        delete updatedSchedule[day][shopToDelete];
      }
    });

    setSchedule(updatedSchedule);
    persistRoster(employees, updatedShops, updatedSlotsConfig);
    persistSchedule(updatedSchedule);
  };

  const handleAssignShift = (empId: string) => {
    if (!selectedCell) return;
    const { day, shop, slotId } = selectedCell;

    const daySched = schedule[day] || {};
    const shopSched = daySched[shop] || {};
    
    const newShopSched = {
      ...shopSched,
      [slotId]: empId === 'unassigned' ? null : empId
    };

    const updatedSchedule = {
      ...schedule,
      [day]: {
        ...daySched,
        [shop]: newShopSched
      }
    };

    setSchedule(updatedSchedule);
    persistSchedule(updatedSchedule);
    setSelectedCell(null);
  };

  const handleAutoSchedule = () => {
    const updatedSchedule: any = {};
    const empPool: string[] = [];
    
    employees.forEach(emp => {
      for (let i = 0; i < emp.maxShifts; i++) {
        empPool.push(emp.id);
      }
    });

    const shuffledPool = [...empPool].sort(() => Math.random() - 0.5);
    let poolIndex = 0;

    DAYS.forEach(day => {
      updatedSchedule[day] = {};
      shops.forEach(shop => {
        updatedSchedule[day][shop] = {};
        SLOTS.forEach(slot => {
          let assigned = false;
          let attempts = 0;
          
          while (!assigned && poolIndex < shuffledPool.length && attempts < shuffledPool.length) {
            const potentialEmp = shuffledPool[poolIndex];
            
            const isDoubleBooked = Object.keys(updatedSchedule[day]).some(otherShop => {
              return updatedSchedule[day][otherShop]?.[slot.id] === potentialEmp;
            });

            if (!isDoubleBooked) {
              updatedSchedule[day][shop][slot.id] = potentialEmp;
              shuffledPool.splice(poolIndex, 1);
              assigned = true;
            } else {
              poolIndex = (poolIndex + 1) % shuffledPool.length;
              attempts++;
            }
          }
          poolIndex = 0;
        });
      });
    });

    setSchedule(updatedSchedule);
    persistSchedule(updatedSchedule);
  };

  const handleClearSchedule = () => {
    setSchedule({});
    persistSchedule({});
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {/* Header Banner */}
      <header className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
              <Store className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-extrabold tracking-tight">Multi-Shop Roster & Scale Planner</h1>
                {/* Database Sync Status Badge */}
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  syncStatus === 'Connected' || syncStatus === 'Saved'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : syncStatus === 'Saving...'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  <Database className="w-3.5 h-3.5" />
                  {syncStatus}
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-0.5">Cloud-synced calendar planner & dynamic attendance matrix</p>
            </div>
          </div>
          
          {/* Navigation Tabs */}
          <nav className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/50 flex-wrap">
            <button 
              onClick={() => setActiveTab('scheduler')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${activeTab === 'scheduler' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
            >
              <Calendar className="w-4 h-4" />
              Weekly Scheduler
            </button>
            <button 
              onClick={() => setActiveTab('employees')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${activeTab === 'employees' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
            >
              <Users className="w-4 h-4" />
              Roster & Shops ({employees.length})
            </button>
            <button 
              onClick={() => setActiveTab('attendance')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${activeTab === 'attendance' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Attendance & Payroll
            </button>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
            >
              <Calculator className="w-4 h-4" />
              Expansion Calculator
            </button>
          </nav>
        </div>
      </header>

      {/* Database Global Loading State */}
      {dbLoading && (
        <div className="bg-indigo-50 border-b border-indigo-100 py-2.5 text-center text-xs font-semibold text-indigo-700 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Synchronizing workspace with real-time cloud database...
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        
        {/* TAB 1: WEEKLY SCHEDULER */}
        {activeTab === 'scheduler' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Quick Actions & Roster Stats bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-indigo-600"></span>
                  <span className="text-slate-600">Total Scheduled:</span>
                  <strong className="text-slate-900">{currentAssignedStats.totalAssigned} / {TOTAL_SLOTS_NEEDED} Shifts</strong>
                </div>
                
                <div className="h-4 w-px bg-slate-200 hidden md:block"></div>

                <div className="flex items-center gap-1">
                  <span className="text-slate-600">Configured Shops:</span>
                  <span className="font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                    {shops.length} {shops.length === 1 ? 'Shop' : 'Shops'}
                  </span>
                </div>

                <div className="h-4 w-px bg-slate-200 hidden md:block"></div>

                <div className="flex items-center gap-1">
                  <span className="text-slate-600">Coverage:</span>
                  <span className={`font-bold px-2 py-0.5 rounded ${
                    currentAssignedStats.totalAssigned === TOTAL_SLOTS_NEEDED 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {TOTAL_SLOTS_NEEDED > 0 ? Math.round((currentAssignedStats.totalAssigned / TOTAL_SLOTS_NEEDED) * 100) : 0}%
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <button 
                  onClick={handleAutoSchedule}
                  className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-semibold px-3 py-2 rounded-lg transition-colors"
                  title="Spread assigned shifts evenly across all declared active staff members"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Auto-Distribute Template
                </button>
                <button 
                  onClick={handleClearSchedule}
                  className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 text-xs bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                  Clear Calendar
                </button>
              </div>
            </div>

            {/* Double Booking warnings container */}
            {scheduleConflicts.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-900 text-sm">Schedule Conflicts Detected</h4>
                  <p className="text-xs text-rose-700 mt-0.5">Please resolve the following double-bookings where one person is assigned to separate shops simultaneously:</p>
                  <ul className="list-disc pl-5 mt-2 text-xs text-rose-800 space-y-1">
                    {scheduleConflicts.map((c, i) => (
                      <li key={i}>
                        <strong>{c.empName}</strong> scheduled at <strong>{c.day}</strong> ({c.slotId === 1 ? 'Slot 1' : 'Slot 2'}) in both: {c.shops.join(' & ')}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Main Interactive Grid Layout */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse table-fixed">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="w-40 px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider sticky left-0 bg-slate-900 z-10">
                        Shop & Slot
                      </th>
                      {DAYS.map(day => (
                        <th key={day} className="px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wider">
                          {day.substring(0, 3)}
                          <span className="block text-[10px] font-normal text-slate-400 capitalize">{day}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {shops.map((shop) => {
                      // Fetch customized shift details per shop
                      const s1Details = getSlotDetails(shop, 1);
                      const s2Details = getSlotDetails(shop, 2);

                      return (
                        <Fragment key={shop}>
                          {/* Slot 1 Row */}
                          <tr className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.03)] z-10">
                              <div className="font-bold text-xs text-slate-900 truncate">{shop}</div>
                              <div className="text-[10px] font-semibold text-indigo-600 uppercase tracking-tight flex flex-col mt-0.5">
                                <span className="flex items-center gap-1 font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                  {s1Details.name}
                                </span>
                                {s1Details.time && <span className="text-[9px] text-slate-400 font-medium pl-2.5">({s1Details.time})</span>}
                              </div>
                            </td>
                            {DAYS.map(day => {
                              const empId = schedule[day]?.[shop]?.[1];
                              const emp = employees.find(e => e.id === empId);
                              const styleClass = emp ? COLOR_MAPS[emp.color || 'slate'] : null;

                              return (
                                <td key={`${day}-1`} className="p-1 border-r border-slate-100 last:border-r-0">
                                  <button
                                    onClick={() => setSelectedCell({ day, shop, slotId: 1 })}
                                    className={`w-full min-h-[54px] p-2 rounded-lg border text-left transition-all flex flex-col justify-between ${
                                      emp 
                                        ? `${styleClass?.bg} shadow-xs border-indigo-100` 
                                        : 'border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50 bg-slate-50/30'
                                    }`}
                                  >
                                    {emp ? (
                                      <>
                                        <span className="font-bold text-xs block leading-tight truncate">{emp.name}</span>
                                        <span className="text-[9px] text-indigo-500/80 block mt-1">Slot 1 assigned</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-[10px] font-medium text-slate-400">Unassigned</span>
                                        <span className="text-[9px] text-slate-300 block mt-1">+ Assign Staff</span>
                                      </>
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>

                          {/* Slot 2 Row */}
                          <tr className="border-b-2 border-slate-200/80 hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.03)] z-10">
                              <div className="font-bold text-xs text-slate-900 truncate">{shop}</div>
                              <div className="text-[10px] font-semibold text-violet-600 uppercase tracking-tight flex flex-col mt-0.5">
                                <span className="flex items-center gap-1 font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
                                  {s2Details.name}
                                </span>
                                {s2Details.time && <span className="text-[9px] text-slate-400 font-medium pl-2.5">({s2Details.time})</span>}
                              </div>
                            </td>
                            {DAYS.map(day => {
                              const empId = schedule[day]?.[shop]?.[2];
                              const emp = employees.find(e => e.id === empId);
                              const styleClass = emp ? COLOR_MAPS[emp.color || 'slate'] : null;

                              return (
                                <td key={`${day}-2`} className="p-1 border-r border-slate-100 last:border-r-0">
                                  <button
                                    onClick={() => setSelectedCell({ day, shop, slotId: 2 })}
                                    className={`w-full min-h-[54px] p-2 rounded-lg border text-left transition-all flex flex-col justify-between ${
                                      emp 
                                        ? `${styleClass?.bg} shadow-xs border-violet-100` 
                                        : 'border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50 bg-slate-50/30'
                                    }`}
                                  >
                                    {emp ? (
                                      <>
                                        <span className="font-bold text-xs block leading-tight truncate">{emp.name}</span>
                                        <span className="text-[9px] text-violet-500/80 block mt-1">Slot 2 assigned</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-[10px] font-medium text-slate-400">Unassigned</span>
                                        <span className="text-[9px] text-slate-300 block mt-1">+ Assign Staff</span>
                                      </>
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick-reference Side Panels & Workload Trackers */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Staff Workloads Widget */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm col-span-2">
                <h4 className="font-bold text-slate-900 text-sm mb-4">Roster Allocation & Target Tracker</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {employees.map(emp => {
                    const assignedCount = currentAssignedStats.stats[emp.id] || 0;
                    const max = emp.maxShifts;
                    const isOverworked = assignedCount > max;
                    const isPerfect = assignedCount === max;

                    return (
                      <div key={emp.id} className="p-3 border border-slate-100 rounded-lg bg-slate-50/50 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-semibold mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2.5 h-2.5 rounded-full ${COLOR_MAPS[emp.color || 'slate'].fill}`}></span>
                              <span className="text-slate-800 text-sm">{emp.name}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              isOverworked 
                                ? 'bg-rose-100 text-rose-800' 
                                : isPerfect 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-slate-200 text-slate-700'
                            }`}>
                              {assignedCount} / {max} shifts
                            </span>
                          </div>
                          
                          {/* Progress Bar */}
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${isOverworked ? 'bg-rose-500' : 'bg-indigo-600'}`} 
                              style={{ width: `${Math.min(100, (assignedCount / max) * 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Warnings */}
                        <div className="mt-2">
                          {isOverworked && (
                            <div className="text-[10px] text-rose-600 flex items-center gap-1 font-semibold">
                              <AlertTriangle className="w-3 h-3" />
                              Exceeds maximum target workload limit!
                            </div>
                          )}
                          {!isOverworked && assignedCount < max && (
                            <div className="text-[10px] text-slate-500">
                              Underutilized. Can take {max - assignedCount} more shift{max - assignedCount > 1 ? 's' : ''}.
                            </div>
                          )}
                          {isPerfect && (
                            <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Optimal target matched!
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* General Legend Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm mb-3">Scheduling Tips</h4>
                  <ul className="space-y-2.5 text-xs text-slate-600">
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0"></div>
                      <span>Select any unassigned card on the scheduler to assign staff members.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0"></div>
                      <span>You can configure more shops, delete outlets, or **configure unique shift times** in the <strong>Roster & Shops</strong> tab.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0"></div>
                      <span>Track real-time payroll outputs and punch metrics securely logged by actual date under the <strong>Attendance & Payroll</strong> tab.</span>
                    </li>
                  </ul>
                </div>
                
                <div className="pt-4 border-t border-slate-100 mt-4">
                  <div className="text-xs text-slate-400 font-semibold mb-2">Color Coding Roster</div>
                  <div className="flex flex-wrap gap-2">
                    {employees.map(emp => (
                      <span key={emp.id} className={`text-[10px] px-2 py-0.5 border rounded-md font-medium ${COLOR_MAPS[emp.color || 'slate'].bg}`}>
                        {emp.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: ROSTER & SHOPS */}
        {activeTab === 'employees' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Split Grid: Left side Shops, Right side Employees */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* SHOPS EXPANSION MANAGEMENT PANEL */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Store className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-lg font-bold text-slate-900">Manage Retail Shops</h3>
                  </div>
                  <p className="text-xs text-slate-500">
                    Expand outlets. Click the clock icon next to any shop to configure custom shift names and time windows.
                  </p>
                </div>

                {/* Form to add a new shop */}
                <form onSubmit={handleAddShop} className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">New Outlet Name</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Shop 4 or Mall Kiosk"
                      value={newShopName}
                      onChange={(e) => {
                        setNewShopName(e.target.value);
                        setShopError('');
                      }}
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Shop
                    </button>
                  </div>
                  {shopError && <p className="text-xs text-rose-600 font-medium">{shopError}</p>}
                </form>

                {/* List of configured shops with Shift configuration trigger */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Outlets ({shops.length})</div>
                  
                  {shops.length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                      No shops configured. Add a shop to begin scheduling!
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto border border-slate-100 rounded-xl bg-slate-50/50 p-2 space-y-1">
                      {shops.map((shop, index) => {
                        const s1 = getSlotDetails(shop, 1);
                        const s2 = getSlotDetails(shop, 2);
                        
                        return (
                          <div key={shop} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200/50 shadow-xs">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center">
                                {index + 1}
                              </span>
                              <div>
                                <span className="text-xs font-bold text-slate-700 block">{shop}</span>
                                <span className="text-[9px] text-slate-400 block mt-0.5">
                                  {s1.name} / {s2.name}
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditSlots(shop)}
                                className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-md hover:bg-indigo-50 transition-colors"
                                title="Configure Shift Names & Times"
                              >
                                <Clock className="w-3.5 h-3.5" />
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => handleDeleteShop(shop)}
                                className="text-slate-400 hover:text-rose-600 p-1.5 rounded-md hover:bg-rose-50 transition-colors"
                                title="Remove shop (and clear associated scheduled shifts)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl flex gap-2.5 items-start">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    <strong>Note:</strong> Deleting a shop automatically unassigns any shifts previously scheduled in that specific outlet.
                  </p>
                </div>
              </div>

              {/* EMPLOYEES ROSTER PANEL (Rogue 'tap' string completely removed) */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-5 h-5 text-indigo-600" />
                      <h3 className="text-lg font-bold text-slate-900">Manage Staff Members</h3>
                    </div>
                    <p className="text-xs text-slate-500">
                      View your current team, specify target limits (clamped to max 7 days), and edit their weekly shift counts & per-shift pay rates directly.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowAddEmp(true)}
                    className="inline-flex items-center gap-1.5 text-xs bg-indigo-600 text-white font-bold px-3.5 py-2 rounded-xl hover:bg-indigo-700 transition-colors shrink-0 shadow-xs"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    New Staff / Placeholder
                  </button>
                </div>

                {/* List of employees */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[460px] overflow-y-auto pr-1">
                  {employees.map(emp => {
                    const assignedCount = currentAssignedStats.stats[emp.id] || 0;
                    
                    return (
                      <div key={emp.id} className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 relative overflow-hidden flex flex-col justify-between min-h-[160px]">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-950" style={{ backgroundColor: `var(--${emp.color})` }}>
                          <div className={`w-full h-full ${COLOR_MAPS[emp.color || 'slate'].fill}`}></div>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="flex items-start justify-between pl-1">
                            <div>
                              <h4 className="font-bold text-sm text-slate-900 truncate max-w-[110px]">{emp.name}</h4>
                              <span className="text-[10px] text-slate-400 uppercase tracking-tight font-semibold">Sales Agent</span>
                            </div>

                            {/* Interactive Shift Count Stepper (Strictly Removed rogue word "tap") */}
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Weekly Target</span>
                              <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateMaxShifts(emp.id, emp.maxShifts - 1)}
                                  className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 transition-colors font-bold border-r border-slate-150"
                                  title="Decrease shifts"
                                >
                                  -
                                </button>
                                <span className="px-2 text-xs font-extrabold text-slate-800 min-w-[20px] text-center bg-slate-50/50">
                                  {emp.maxShifts}
                                </span>
                                <button
                                  type="button"
                                  disabled={emp.maxShifts >= 7}
                                  onClick={() => handleUpdateMaxShifts(emp.id, emp.maxShifts + 1)}
                                  className={`px-2 py-1 text-xs font-bold border-l border-slate-150 transition-colors ${emp.maxShifts >= 7 ? 'text-slate-300 bg-slate-50 cursor-not-allowed' : 'text-slate-500 hover:bg-slate-100'}`}
                                  title={emp.maxShifts >= 7 ? "Max weekly limit is 7 days" : "Increase shifts"}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Wage Customization - shift-based pay configuration */}
                          <div className="pl-1 flex items-center justify-between border-t border-slate-200/40 pt-3">
                            <span className="text-xs text-slate-500 font-medium">Per Shift Pay Rate</span>
                            <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleUpdateShiftRate(emp.id, (emp.shiftRate || 250) - 10)}
                                className="px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 font-bold border-r border-slate-150"
                              >
                                -
                              </button>
                              <span className="px-2 text-xs font-bold text-indigo-700 min-w-[58px] text-center bg-indigo-50/20">
                                ৳{emp.shiftRate || 250}/sh
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateShiftRate(emp.id, (emp.shiftRate || 250) + 10)}
                                className="px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 font-bold border-l border-slate-150"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-2.5 border-t border-slate-200/50 flex items-center justify-between pl-1">
                          <span className="text-xs text-slate-600 font-semibold flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            Active: <strong className="text-indigo-600">{assignedCount}</strong>
                          </span>
                          
                          <button
                            onClick={() => handleDeleteEmployee(emp.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors"
                            title="Delete employee and clear schedules"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 3: ATTENDANCE & COMPENSATION (INTEGRATED CALENDAR VIEW) */}
        {activeTab === 'attendance' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Quick Metrics Card Grid with Taka markers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                  <span className="text-xl font-black">৳</span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {payrollViewMode === 'daily' ? `Gross Daily Ledger` : payrollViewMode === 'weekly' ? 'Gross Weekly Payroll' : 'Gross Monthly Ledger'}
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 mt-0.5">৳{payrollStats.totalPayroll}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {payrollViewMode === 'daily' ? `For logged shifts on ${selectedDate}` : 'Calculated exact ledger range'}
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Present Shifts</div>
                  <div className="text-2xl font-extrabold text-emerald-700 mt-0.5">{payrollStats.presentCount}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {payrollViewMode === 'daily' ? `Attended today` : 'Aggregated ledger total'}
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Late Arrivals</div>
                  <div className="text-2xl font-extrabold text-amber-700 mt-0.5">{payrollStats.lateCount}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Modified shift payouts</div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Absent / No Show</div>
                  <div className="text-2xl font-extrabold text-rose-700 mt-0.5">{payrollStats.absentCount}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Uncovered scheduled slots</div>
                </div>
              </div>
            </div>

            {/* Attendance View Header - Real Date Picker Carousel */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-bold text-slate-700">Select Date Checklist:</span>
              </div>
              
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <button 
                  onClick={() => shiftSelectedDate(-1)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider w-16 text-center hidden sm:inline-block">
                    {getDayName(selectedDate).substring(0, 3)}
                  </span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e: any) => setSelectedDate(e.target.value)}
                    className="font-bold text-sm bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <button 
                  onClick={() => shiftSelectedDate(1)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Split layout: Left is Payroll overview table, Right is daily shift attendance checklist matrix */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* PAYROLL SUMMARY REPORT */}
              <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Compensation Ledger</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Calculated based on real calendar attendance.</p>
                  </div>

                  {/* Ledger Basis Mode Switcher */}
                  <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0 flex-wrap gap-1 sm:gap-0">
                    <button 
                      onClick={() => setPayrollViewMode('daily')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${payrollViewMode === 'daily' ? 'bg-white text-indigo-950 shadow-xs font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Daily View
                    </button>
                    <button 
                      onClick={() => setPayrollViewMode('weekly')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${payrollViewMode === 'weekly' ? 'bg-white text-indigo-950 shadow-xs font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Weekly Summary
                    </button>
                    <button 
                      onClick={() => setPayrollViewMode('monthly')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${payrollViewMode === 'monthly' ? 'bg-white text-indigo-950 shadow-xs font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Monthly Summary
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs divide-y divide-slate-200">
                    <thead>
                      <tr className="text-slate-400 uppercase tracking-wider text-[10px] font-bold">
                        <th className="py-3 px-2">Staff Employee</th>
                        <th className="py-3 px-2 text-center">Per-Shift Rate</th>
                        <th className="py-3 px-2 text-center">
                          {payrollViewMode === 'daily' ? "Shifts Logged" : "Expected Shifts"}
                        </th>
                        <th className="py-3 px-2 text-center">P / L / A</th>
                        <th className="py-3 px-2 text-center">Shifts Completed</th>
                        <th className="py-3 px-2 text-right">
                          {payrollViewMode === 'daily' ? "Daily Earnings" : "Aggregated Earnings"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {unifiedLedger.map(emp => (
                        <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${COLOR_MAPS[emp.color || 'slate'].fill}`}></span>
                              <span className="font-bold text-slate-800">{emp.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center font-bold text-indigo-700 bg-indigo-50/20 rounded">৳{emp.shiftRate}/sh</td>
                          
                          {/* Conditional Column rendering based on view mode */}
                          <td className="py-3 px-2 text-center text-slate-500">
                            {payrollViewMode === 'daily' ? (
                              <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-md text-slate-700 font-semibold block truncate max-w-[120px] mx-auto" title={emp.shiftsWorked.join(', ')}>
                                {emp.shiftsWorked.length > 0 ? emp.shiftsWorked.join(', ') : '—'}
                              </span>
                            ) : (
                              <span>{emp.assignedShifts}</span>
                            )}
                          </td>

                          {/* Unified Status Badge Tally */}
                          <td className="py-3 px-2 text-center">
                            <div className="flex items-center justify-center gap-1 font-bold text-[10px]">
                              <span className="text-emerald-600" title="Present">{emp.presentCount}P</span>
                              {emp.lateCount > 0 && <span className="text-amber-600" title="Late">• {emp.lateCount}L</span>}
                              {emp.absentCount > 0 && <span className="text-rose-600" title="Absent">• {emp.absentCount}A</span>}
                            </div>
                          </td>

                          <td className="py-3 px-2 text-center font-extrabold text-slate-900">
                            <span>{emp.totalShiftsWorked} shift{emp.totalShiftsWorked !== 1 ? 's' : ''}</span>
                          </td>
                          <td className="py-3 px-2 text-right font-black text-slate-950 text-sm">
                            ৳{emp.payout}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Grand Total due ({payrollViewMode === 'daily' ? `For ${selectedDate}` : payrollViewMode === 'weekly' ? 'Weekly Ledger' : `Exact ledger for ${getMonthName(selectedDate)}`}):</span>
                  <span className="text-base font-black text-slate-900">৳{payrollStats.totalPayroll} BDT</span>
                </div>
              </div>

              {/* INTEGRATED DUAL-GRID DAILY SHOP & SLOT ATTENDANCE MATRIX */}
              <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Daily Attendance Matrix Check-in Sheet</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Fixed shop and slot representation for <strong>{selectedDate} ({getDayName(selectedDate)})</strong>. Mark statuses and shift portions.</p>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider">
                        <th className="py-3 px-3">Shop Outlet</th>
                        <th className="py-3 px-3">Time Window</th>
                        <th className="py-3 px-3">Scheduled Staff</th>
                        <th className="py-3 px-3 text-right">Attendance Action & Multiplier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {shops.map(shop => (
                        SLOTS.map(slot => {
                          const dayOfWeek = getDayName(selectedDate);
                          const empId = schedule[dayOfWeek]?.[shop]?.[slot.id];
                          const emp = employees.find(e => e.id === empId);
                          const attKey = `${shop}-${slot.id}`;
                          const record = attendance[selectedDate]?.[attKey] || { status: 'Present', multiplier: 1.0 };
                          
                          const styleClass = emp ? COLOR_MAPS[emp.color || 'slate'] : null;
                          const earnings = emp ? Math.round((record.status === 'Absent' ? 0 : record.multiplier) * emp.shiftRate) : 0;

                          const shopSlotDetails = getSlotDetails(shop, slot.id);

                          return (
                            <tr key={`${shop}-${slot.id}`} className="hover:bg-slate-50/50 transition-colors">
                              {/* Shop Outlet name */}
                              <td className="py-3.5 px-3 font-bold text-slate-900 border-r border-slate-100">
                                {shop}
                              </td>

                              {/* Shift Slot Time */}
                              <td className="py-3.5 px-3 border-r border-slate-100">
                                <span className={`inline-flex items-center gap-1 font-bold text-[10px] uppercase ${slot.id === 1 ? 'text-indigo-600' : 'text-violet-600'}`}>
                                  {shopSlotDetails.name}
                                </span>
                                {shopSlotDetails.time && <div className="text-[10px] text-slate-400 mt-0.5">{shopSlotDetails.time}</div>}
                              </td>

                              {/* Scheduled Employee check */}
                              <td className="py-3.5 px-3 border-r border-slate-100">
                                {emp ? (
                                  <div className="space-y-1">
                                    <span className={`inline-block px-2 py-0.5 border rounded font-semibold text-[10px] ${styleClass?.bg}`}>
                                      {emp.name}
                                    </span>
                                    <div className="text-[9px] text-slate-500 font-bold">Payout: ৳{earnings}</div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px] font-medium">No coverage scheduled</span>
                                )}
                              </td>

                              {/* Attendance Status Action Selector & Shift portion completed multiplier */}
                              <td className="py-3.5 px-3 text-right">
                                {emp ? (
                                  <div className="space-y-2">
                                    {/* Action togglers */}
                                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateAttendance(selectedDate, shop, slot.id, 'Present', record.multiplier || 1.0)}
                                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${record.status === 'Present' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                      >
                                        Pres
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateAttendance(selectedDate, shop, slot.id, 'Late', record.multiplier || 1.0)}
                                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${record.status === 'Late' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                      >
                                        Late
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateAttendance(selectedDate, shop, slot.id, 'Absent', 0)}
                                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${record.status === 'Absent' ? 'bg-rose-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                                      >
                                        Abs
                                      </button>
                                    </div>

                                    {/* Shift multipliers */}
                                    {record.status !== 'Absent' && (
                                      <div className="space-y-1">
                                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-tight">Shift Completion multiplier</div>
                                        <div className="flex justify-end gap-1.5">
                                          {[1.0, 0.5, 0.2].map(mult => (
                                            <button
                                              key={mult}
                                              type="button"
                                              onClick={() => handleUpdateAttendance(selectedDate, shop, slot.id, record.status, mult)}
                                              className={`px-1.5 py-0.5 text-[9px] rounded font-extrabold border transition-all ${
                                                Number(record.multiplier) === mult 
                                                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700' 
                                                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                              }`}
                                            >
                                              {mult === 1.0 ? 'Full (1.0)' : mult === 0.5 ? 'Half (0.5)' : 'Qtr (0.2)'}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-300 italic pr-2">Cannot record attendance</div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 4: EXPANSION CALCULATOR */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Top Operational Expansion Comparison Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-3">
              <div className="p-6 md:p-8 bg-slate-50 border-r border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 mb-4">
                    Current Setup
                  </span>
                  <h3 className="text-xl font-bold text-slate-800">{shops.length} Outlets Daily</h3>
                  <p className="text-slate-500 text-sm mt-1">Single shift coverage model</p>
                  
                  <ul className="mt-6 space-y-3 text-sm text-slate-600">
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                      <span>{shops.length} Shops × 1 Slot × 7 Days = <strong className="text-slate-800">{shops.length * 7} Shifts/week</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                      <span>Staff Capacity: <strong className="text-slate-800">{currentTeamCapacity} Shifts/week</strong></span>
                    </li>
                  </ul>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-200/60">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Existing Staff Load</div>
                  <div className="flex gap-2 flex-wrap">
                    {employees.slice(0, 3).map(e => (
                      <span key={e.id} className="text-xs px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium text-slate-700">
                        {e.name}: {e.maxShifts}d
                      </span>
                    ))}
                    {employees.length > 3 && (
                      <span className="text-xs px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg font-medium text-slate-500">
                        +{employees.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Expansion Goal Side */}
              <div className="col-span-2 p-6 md:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      Goal Setup
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
                      <Clock className="w-3.5 h-3.5" /> Double-Shift: 12 PM - 10 PM
                    </span>
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-950">Double-Shift Expansion Model</h3>
                  <p className="text-slate-500 text-sm mt-1">Simulated workload coverage required to double operational windows for lunch & dinner peak trade</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                    <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100">
                      <div className="text-xs font-semibold text-indigo-500 uppercase">Total Weekly Shifts</div>
                      <div className="text-2xl font-extrabold text-slate-900 mt-1">{TOTAL_SLOTS_NEEDED}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{shops.length} shops × 2 slots × 7 days</div>
                    </div>
                    
                    <div className="p-4 rounded-xl bg-violet-50/50 border border-violet-100">
                      <div className="text-xs font-semibold text-violet-500 uppercase">Roster Capacity Covered</div>
                      <div className="text-2xl font-extrabold text-slate-900 mt-1">{currentTeamCapacity}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{TOTAL_SLOTS_NEEDED > 0 ? Math.round((currentTeamCapacity/TOTAL_SLOTS_NEEDED)*100) : 0}% met</div>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100 sm:col-span-2 md:col-span-1">
                      <div className="text-xs font-semibold text-amber-500 uppercase">Weekly Shift Deficit</div>
                      <div className="text-2xl font-extrabold text-amber-700 mt-1">{deficitSlots}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Shifts requiring new hires</div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between flex-wrap gap-4 bg-slate-50 -mx-6 -mb-6 p-6 lg:-mx-8 lg:-mb-8">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-500" />
                    <span className="text-sm font-semibold text-slate-700">Ready to draft your ideal staffing schedule?</span>
                  </div>
                  <button 
                    onClick={() => setActiveTab('scheduler')}
                    className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                  >
                    Go to Schedule Grid
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Hiring Calculator Tool Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 md:p-8">
              <div className="flex items-center gap-2.5 mb-6">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-950">Dynamic Part-Time Hiring Estimator</h3>
                  <p className="text-slate-500 text-sm">Input realistic part-time availability targets to estimate necessary headcounts across all {shops.length} active outlets.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Inputs panel */}
                <div className="lg:col-span-5 space-y-6 bg-slate-50/70 p-5 rounded-xl border border-slate-100">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Average shifts worked by a part-time hire per week:
                    </label>
                    <div className="flex items-center gap-4">
                      <input 
                        type="range" 
                        min="1" 
                        max="6" 
                        step="1"
                        value={avgWeeklyDays}
                        onChange={(e: any) => setAvgWeeklyDays(Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <span className="text-xl font-extrabold text-slate-900 bg-white border border-slate-200 px-3 py-1 rounded-lg shadow-xs min-w-[50px] text-center">
                        {avgWeeklyDays}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Typically, part-time store sales employees prefer 2 to 4 shifts a week.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-200/60">
                    <div className="text-sm font-bold text-slate-800 mb-2">Custom Part-Time Scenarios</div>
                    <div className="grid grid-cols-3 gap-2">
                      <button 
                        onClick={() => setAvgWeeklyDays(2)} 
                        className={`py-2 px-3 text-xs font-semibold border rounded-lg transition-all ${avgWeeklyDays === 2 ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                      >
                        Low Committal (2 shifts)
                      </button>
                      <button 
                        onClick={() => setAvgWeeklyDays(3)} 
                        className={`py-2 px-3 text-xs font-semibold border rounded-lg transition-all ${avgWeeklyDays === 3 ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                      >
                        Standard (3 shifts)
                      </button>
                      <button 
                        onClick={() => setAvgWeeklyDays(4)} 
                        className={`py-2 px-3 text-xs font-semibold border rounded-lg transition-all ${avgWeeklyDays === 4 ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                      >
                        Committed (4 shifts)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Estimation Output */}
                <div className="lg:col-span-7 flex flex-col justify-center text-center lg:text-left bg-indigo-900/5 rounded-xl border border-indigo-100 p-6">
                  <div className="max-w-md mx-auto lg:mx-0">
                    <div className="text-indigo-600/90 font-bold uppercase text-xs tracking-wider">Hiring Recommendation</div>
                    <div className="text-5xl font-extrabold text-indigo-950 mt-1.5 flex items-baseline gap-2 justify-center lg:justify-start">
                      {estimatedHiresNeeded}
                      <span className="text-lg font-semibold text-slate-500">New Part-Timers</span>
                    </div>
                    <p className="text-slate-600 text-sm mt-3 leading-relaxed">
                      To successfully support your <strong>{shops.length} shops</strong> across 2 daily slots, you need <strong className="text-indigo-900">{deficitSlots} weekly shifts</strong> staffed by new hires. Under your target scenario of <strong className="text-indigo-900">{avgWeeklyDays} shifts/week</strong>, we suggest hiring <strong className="text-indigo-900">{estimatedHiresNeeded} additional personnel</strong>.
                    </p>

                    <div className="mt-6 p-3.5 bg-white border border-indigo-100/50 rounded-lg flex items-start gap-3 text-left shadow-xs">
                      <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-500 leading-relaxed">
                        <strong>Recruiter tip:</strong> Adding 1 extra backup hire secure coverage for key retail events, weekends, or unexpected leaves.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-16 text-center text-xs text-slate-500">
        <p>© 2026 Multi-Shop Retail Planner. All system calculations and shift validations update instantly in-memory.</p>
      </footer>

      {/* MODAL 1: ADD EMPLOYEE POPUP */}
      {showAddEmp && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full shadow-xl overflow-hidden animate-zoomIn">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h4 className="font-bold text-slate-900">Add New Team Member</h4>
              <button onClick={() => setShowAddEmp(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddEmployee} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Employee Name / Identifier</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Rohid or 'New Hire A'"
                  value={newEmpName}
                  onChange={(e: any) => setNewEmpName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Shifts Per Week</label>
                  <select 
                    value={newEmpShifts}
                    onChange={(e: any) => setNewEmpShifts(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-sm"
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map(num => (
                      <option key={num} value={num}>{num} {num === 1 ? 'shift' : 'shifts'}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Shift Pay Rate (৳)</label>
                  <input 
                    type="number"
                    min="50"
                    max="2000"
                    required
                    value={newEmpRate}
                    onChange={(e: any) => setNewEmpRate(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Assigned Theme Color</label>
                <div className="flex gap-2">
                  {Object.keys(COLOR_MAPS).map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewEmpColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${newEmpColor === color ? 'border-slate-800 scale-110 shadow-sm' : 'border-transparent'}`}
                      style={{ backgroundColor: color === 'slate' ? '#64748b' : color === 'rose' ? '#f43f5e' : color === 'emerald' ? '#10b981' : color === 'indigo' ? '#6366f1' : color === 'violet' ? '#8b5cf6' : color === 'sky' ? '#0ea5e9' : color === 'amber' ? '#f59e0b' : '#f97316' }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setShowAddEmp(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                  Add to Roster
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SHIFT ASSIGNMENT DROPDOWN MODAL */}
      {selectedCell && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full shadow-xl overflow-hidden animate-zoomIn">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Assign Shift Coordinator</h4>
                <p className="text-slate-500 text-[11px] font-medium">{selectedCell.day} • {selectedCell.shop} • {getSlotDetails(selectedCell.shop, selectedCell.slotId).name}</p>
              </div>
              <button onClick={() => setSelectedCell(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Shift Assignment dynamic categories lists */}
            <div className="p-4 max-h-[360px] overflow-y-auto space-y-4">
              
              {/* Option to clear / unassign slot */}
              <div>
                <button
                  onClick={() => handleAssignShift('unassigned')}
                  className="w-full text-left p-2.5 border border-slate-250 rounded-xl hover:bg-slate-50 flex items-center justify-between transition-colors bg-white shadow-3xs"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                    <span className="text-xs font-bold text-slate-700">Leave Unassigned / Empty</span>
                  </div>
                  {!schedule[selectedCell.day]?.[selectedCell.shop]?.[selectedCell.slotId] && (
                    <CheckCircle2 className="w-4.5 h-4.5 text-slate-500" />
                  )}
                </button>
              </div>

              {/* CATEGORY 1: RECOMMENDED / AVAILABLE STAFF */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready & Available
                </div>
                {dynamicAvailability.available.length === 0 ? (
                  <p className="text-[11px] text-slate-400 pl-1 py-1">No fully available staff members. See limits below.</p>
                ) : (
                  <div className="space-y-1">
                    {dynamicAvailability.available.map(emp => {
                      const isSelected = schedule[selectedCell.day]?.[selectedCell.shop]?.[selectedCell.slotId] === emp.id;
                      return (
                        <button
                          key={emp.id}
                          onClick={() => handleAssignShift(emp.id)}
                          className={`w-full text-left p-2.5 border rounded-xl flex items-center justify-between transition-colors ${
                            isSelected 
                              ? 'border-indigo-600 bg-indigo-50/50' 
                              : 'border-slate-150 hover:bg-emerald-50/20 hover:border-emerald-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${COLOR_MAPS[emp.color || 'slate'].fill}`}></div>
                            <div>
                              <span className="text-xs font-bold text-slate-800 block">{emp.name}</span>
                              <span className="text-[10px] text-slate-500 block">
                                Scheduled: {emp.currentShifts} / {emp.maxShifts} shifts • ৳{emp.shiftRate}/shift
                              </span>
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* CATEGORY 2: AT TARGET CAPACITY */}
              {dynamicAvailability.atCapacity.length > 0 && (
                <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" /> At Weekly Capacity Target
                  </div>
                  <div className="space-y-1">
                    {dynamicAvailability.atCapacity.map(emp => {
                      const isSelected = schedule[selectedCell.day]?.[selectedCell.shop]?.[selectedCell.slotId] === emp.id;
                      return (
                        <button
                          key={emp.id}
                          onClick={() => handleAssignShift(emp.id)}
                          className={`w-full text-left p-2.5 border rounded-xl flex items-center justify-between transition-colors ${
                            isSelected 
                              ? 'border-indigo-600 bg-indigo-50/50' 
                              : 'border-slate-150 hover:bg-amber-50/20 hover:border-amber-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${COLOR_MAPS[emp.color || 'slate'].fill} opacity-60`}></div>
                            <div>
                              <span className="text-xs font-bold text-slate-700 block">{emp.name}</span>
                              <span className="text-[10px] text-slate-400 block">
                                Capped: {emp.currentShifts} / {emp.maxShifts} shifts
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-md">
                              Full
                            </span>
                            {isSelected && <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CATEGORY 3: DOUBLE-BOOKED / CONFLICTS */}
              {dynamicAvailability.doubleBooked.length > 0 && (
                <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Scheduled Elsewhere This Hour
                  </div>
                  <div className="space-y-1">
                    {dynamicAvailability.doubleBooked.map(emp => {
                      const isSelected = schedule[selectedCell.day]?.[selectedCell.shop]?.[selectedCell.slotId] === emp.id;
                      return (
                        <button
                          key={emp.id}
                          onClick={() => handleAssignShift(emp.id)}
                          className={`w-full text-left p-2.5 border rounded-xl flex items-center justify-between transition-colors ${
                            isSelected 
                              ? 'border-indigo-600 bg-indigo-50/50' 
                              : 'border-rose-100/50 bg-rose-50/10 opacity-75 hover:opacity-100 hover:border-rose-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${COLOR_MAPS[emp.color || 'slate'].fill} opacity-40`}></div>
                            <div>
                              <span className="text-xs font-bold text-slate-500 block">{emp.name}</span>
                              <span className="text-[10px] text-slate-400 block">
                                Shift assigned in another store
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-semibold bg-rose-50 text-rose-700 border border-rose-150 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                              Conflict
                            </span>
                            {isSelected && <CheckCircle2 className="w-4.5 h-4.5 text-indigo-600" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
            
            <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
              <button 
                onClick={() => setSelectedCell(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel / Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CONFIGURE SHOP SHIFTS MODAL */}
      {editingShopSlots && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full shadow-xl overflow-hidden animate-zoomIn">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h4 className="font-bold text-slate-900">Configure Shift Times</h4>
                <p className="text-xs text-slate-500">Setting up shifts for: <strong>{editingShopSlots}</strong></p>
              </div>
              <button onClick={() => setEditingShopSlots(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShopSlots} className="p-5 space-y-4">
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">Slot 1 Configuration</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Slot Name</label>
                    <input 
                      type="text" 
                      required
                      value={slot1NameInput}
                      onChange={(e: any) => setSlot1NameInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Time Range</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 12:00 - 17:00"
                      value={slot1TimeInput}
                      onChange={(e: any) => setSlot1TimeInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="text-xs font-bold uppercase tracking-wider text-violet-600">Slot 2 Configuration</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Slot Name</label>
                    <input 
                      type="text" 
                      required
                      value={slot2NameInput}
                      onChange={(e: any) => setSlot2NameInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Time Range</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 17:00 - 22:00"
                      value={slot2TimeInput}
                      onChange={(e: any) => setSlot2TimeInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setEditingShopSlots(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}



export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <RosterPlanner />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
