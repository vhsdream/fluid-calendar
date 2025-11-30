import {
  HiOutlineCalendar,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineMenu,
  HiOutlinePlus,
} from "react-icons/hi";
import { create } from "zustand";

import { addDays, newDate, subDays } from "@/lib/date-utils";

import { useCalendarUIStore, useViewStore } from "@/store/calendar";

import { Command } from "../types";

// Create a store for managing event modal state
interface EventModalStore {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  defaultDate?: Date;
  setDefaultDate: (date?: Date) => void;
  defaultEndDate?: Date;
  setDefaultEndDate: (date?: Date) => void;
}

export const useEventModalStore = create<EventModalStore>((set) => ({
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
  defaultDate: undefined,
  setDefaultDate: (date) => set({ defaultDate: date }),
  defaultEndDate: undefined,
  setDefaultEndDate: (date) => set({ defaultEndDate: date }),
}));

export function useCalendarCommands(): Command[] {
  const { date: currentDate, setDate } = useViewStore();
  const { isSidebarOpen, setSidebarOpen } = useCalendarUIStore();
  const { setView } = useViewStore();

  const calendarContext = {
    requiredPath: "/calendar",
    navigateIfNeeded: true,
  };

  return [
    {
      id: "calendar.today",
      title: "Go to Today",
      keywords: ["calendar", "today", "now", "current"],
      icon: HiOutlineCalendar,
      section: "calendar",
      perform: () => setDate(newDate()),
      shortcut: "t",
      context: calendarContext,
    },
    {
      id: "calendar.prev-week",
      title: "Previous Week",
      keywords: ["calendar", "previous", "week", "back"],
      icon: HiOutlineChevronLeft,
      section: "calendar",
      perform: () => setDate(subDays(currentDate, 7)),
      shortcut: "left",
      context: {
        requiredPath: "/calendar",
        navigateIfNeeded: false,
      },
    },
    {
      id: "calendar.next-week",
      title: "Next Week",
      keywords: ["calendar", "next", "week", "forward"],
      icon: HiOutlineChevronRight,
      section: "calendar",
      perform: () => setDate(addDays(currentDate, 7)),
      shortcut: "right",
      context: {
        requiredPath: "/calendar",
        navigateIfNeeded: false,
      },
    },
    {
      id: "calendar.toggle-sidebar",
      title: "Toggle Calendar Sidebar",
      keywords: ["calendar", "sidebar", "toggle", "show", "hide"],
      icon: HiOutlineMenu,
      section: "calendar",
      perform: () => setSidebarOpen(!isSidebarOpen),
      shortcut: "b",
      context: calendarContext,
    },
    {
      id: "calendar.new-event",
      title: "Create New Event",
      keywords: ["calendar", "event", "new", "create", "add"],
      icon: HiOutlinePlus,
      section: "calendar",
      perform: () => {
        const now = newDate();
        useEventModalStore.getState().setDefaultDate(now);
        useEventModalStore
          .getState()
          .setDefaultEndDate(newDate(now.getTime() + 3600000)); // 1 hour later
        useEventModalStore.getState().setOpen(true);
      },
      shortcut: "ne",
      context: calendarContext,
    },
    {
      id: "calendar.day-view",
      title: "Switch to Day View",
      keywords: ["calendar", "view", "day"],
      section: "calendar",
      perform: () => setView("day"),
      shortcut: "d",
      context: calendarContext,
    },
    {
      id: "calendar.week-view",
      title: "Switch to Week View",
      keywords: ["calendar", "view", "week"],
      section: "calendar",
      perform: () => setView("week"),
      shortcut: "w",
      context: calendarContext,
    },
    {
      id: "calendar.month-view",
      title: "Switch to Month View",
      keywords: ["calendar", "view", "month"],
      section: "calendar",
      perform: () => setView("month"),
      shortcut: "m",
      context: calendarContext,
    },
    {
      id: "calendar.year-view",
      title: "Switch to 3-Month View",
      keywords: ["calendar", "view", "year"],
      section: "calendar",
      perform: () => setView("multiMonth"),
      shortcut: "y",
      context: calendarContext,
    },
    {
      id: "calendar.agenda-view",
      title: "Switch to Agenda View",
      keywords: ["calendar", "view", "agenda"],
      section: "calendar",
      perform: () => setView("agenda"),
      shortcut: "a",
      context: calendarContext,
    },
  ];
}
