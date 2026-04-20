import React, { useEffect, useMemo, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

/* =========================
   Firebase 設定（可直接替換）
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyCdaGbqhxBjkO43elRRtu8G7UWARU9xHmM",
  authDomain: "my-rental-app-59210.firebaseapp.com",
  projectId: "my-rental-app-59210",
  storageBucket: "my-rental-app-59210.firebasestorage.app",
  messagingSenderId: "131975571748",
  appId: "1:131975571748:web:24ea4a464a8b0d97cdebb1",
  measurementId: "G-X51XB29V66",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* =========================
   常數與工具函式
========================= */
const UI_MODE_KEY = "bnb_ui_mode";
const AUTH_UID_KEY = "bnb_auth_uid";
const LOGIN_ROLE_KEY = "bnb_login_role";

const ROOM_STATUS = ["可訂房", "已被預訂", "停用"];
const BOOKING_STATUS = ["待確認", "已確認", "已取消", "已入住"];
const ACTIVE_BOOKING_STATUS = ["待確認", "已確認", "已入住"];

const emptyTypeForm = {
  name: "",
  description: "",
};

const emptyRoomForm = {
  roomTypeId: "",
  roomName: "",
  price: "",
  capacity: "",
  description: "",
  facilities: "",
  status: "可訂房",
};

const emptyBookingForm = {
  guestName: "",
  phone: "",
  checkIn: "",
  checkOut: "",
  guests: 1,
  note: "",
};

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function isValidDateRange(start, end) {
  if (!start || !end) return false;
  return safeDate(start) < safeDate(end);
}

function isOverlap(startA, endA, startB, endB) {
  return safeDate(startA) < safeDate(endB) && safeDate(endA) > safeDate(startB);
}

function canCancelBooking(booking) {
  if (!booking?.checkIn) return false;
  if (booking.status === "已取消" || booking.status === "已入住") return false;
  return safeDate(booking.checkIn) > safeDate(todayStr());
}

function formatPrice(value) {
  const num = Number(value || 0);
  return `NT$ ${num.toLocaleString("zh-TW")}`;
}

function statusColor(status) {
  switch (status) {
    case "可訂房":
    case "已確認":
      return "#18a058";
    case "待確認":
      return "#f0a020";
    case "已被預訂":
      return "#2080f0";
    case "停用":
    case "已取消":
      return "#d03050";
    case "已入住":
      return "#7b61ff";
    default:
      return "#666";
  }
}

function toArrayFacilities(text) {
  return String(text || "")
    .split(/[,\n、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/* =========================
   主元件
========================= */
export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(localStorage.getItem(LOGIN_ROLE_KEY) || "");
  const [uiMode, setUiMode] = useState(localStorage.getItem(UI_MODE_KEY) || "");

  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [authReady, setAuthReady] = useState(false);
  const [roomTypesReady, setRoomTypesReady] = useState(false);
  const [roomsReady, setRoomsReady] = useState(false);
  const [bookingsReady, setBookingsReady] = useState(false);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [filters, setFilters] = useState({
    checkIn: "",
    checkOut: "",
    roomTypeId: "",
    minPrice: "",
    maxPrice: "",
  });

  const [selectedRoom, setSelectedRoom] = useState(null);
  const [bookingForm, setBookingForm] = useState(emptyBookingForm);

  const [typeForm, setTypeForm] = useState(emptyTypeForm);
  const [editingTypeId, setEditingTypeId] = useState("");

  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [editingRoomId, setEditingRoomId] = useState("");

  const [bookingKeyword, setBookingKeyword] = useState("");

  const loadingOverlay =
    !authReady ||
    !roomTypesReady ||
    !roomsReady ||
    !bookingsReady;

  /* =========================
     初始化登入狀態監聽
  ========================= */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        localStorage.setItem(AUTH_UID_KEY, currentUser.uid);
      } else {
        setUser(null);
        localStorage.removeItem(AUTH_UID_KEY);
      }
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  /* =========================
     監聽 Firestore 資料
  ========================= */
  useEffect(() => {
    const unsubRoomTypes = onSnapshot(
      collection(db, "roomTypes"),
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant"));
        setRoomTypes(data);
        setRoomTypesReady(true);
      },
      (error) => {
        console.error(error);
        setMessage("讀取房型資料失敗");
        setRoomTypesReady(true);
      }
    );

    const unsubRooms = onSnapshot(
      collection(db, "rooms"),
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => String(a.roomName || "").localeCompare(String(b.roomName || ""), "zh-Hant"));
        setRooms(data);
        setRoomsReady(true);
      },
      (error) => {
        console.error(error);
        setMessage("讀取房間資料失敗");
        setRoomsReady(true);
      }
    );

    const unsubBookings = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });
        setBookings(data);
        setBookingsReady(true);
      },
      (error) => {
        console.error(error);
        setMessage("讀取訂單資料失敗");
        setBookingsReady(true);
      }
    );

    return () => {
      unsubRoomTypes();
      unsubRooms();
      unsubBookings();
    };
  }, []);

  useEffect(() => {
    if (uiMode) localStorage.setItem(UI_MODE_KEY, uiMode);
    else localStorage.removeItem(UI_MODE_KEY);
  }, [uiMode]);

  useEffect(() => {
    if (role) localStorage.setItem(LOGIN_ROLE_KEY, role);
    else localStorage.removeItem(LOGIN_ROLE_KEY);
  }, [role]);

  /* =========================
     登入 / 登出
  ========================= */
  async function handleRoleLogin(selectedRole) {
    try {
      setBusy(true);

      let currentUser = auth.currentUser;
      if (!currentUser) {
        const result = await signInAnonymously(auth);
        currentUser = result.user;
      }

      setUser(currentUser);
      localStorage.setItem(AUTH_UID_KEY, currentUser.uid);
      localStorage.setItem(LOGIN_ROLE_KEY, selectedRole);

      setRole(selectedRole);
      setUiMode(selectedRole === "customer" ? "customer" : "admin");
      setMessage(selectedRole === "customer" ? "已以顧客身分登入" : "已以管理員身分登入");
    } catch (error) {
      console.error(error);
      setMessage("登入失敗，請確認 Firebase 已啟用匿名登入");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      setBusy(true);
      await signOut(auth);
      setUser(null);
      setRole("");
      setUiMode("");
      localStorage.removeItem(AUTH_UID_KEY);
      localStorage.removeItem(LOGIN_ROLE_KEY);
      localStorage.removeItem(UI_MODE_KEY);
      setSelectedRoom(null);
      setMessage("已登出");
    } catch (error) {
      console.error(error);
      setMessage("登出失敗");
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     對照資料
  ========================= */
  const roomTypeMap = useMemo(() => {
    const map = {};
    roomTypes.forEach((type) => {
      map[type.id] = type;
    });
    return map;
  }, [roomTypes]);

  const myBookings = useMemo(() => {
    if (!user?.uid) return [];
    return bookings.filter((b) => b.userId === user.uid);
  }, [bookings, user]);

  function getRoomBookings(roomId) {
    return bookings.filter((b) => b.roomId === roomId);
  }

  function getRoomTypeName(roomTypeId) {
    return roomTypeMap[roomTypeId]?.name || "未分類";
  }

  function isRoomAvailableForRange(room, start, end) {
    if (room.status === "停用") return false;
    if (!start || !end) return room.status === "可訂房";

    const targetBookings = getRoomBookings(room.id);
    const hasOverlap = targetBookings.some(
      (booking) =>
        ACTIVE_BOOKING_STATUS.includes(booking.status) &&
        isOverlap(start, end, booking.checkIn, booking.checkOut)
    );

    if (hasOverlap) return false;
    return room.status === "可訂房";
  }

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const price = Number(room.price || 0);

      if (filters.roomTypeId && room.roomTypeId !== filters.roomTypeId) return false;
      if (filters.minPrice && price < Number(filters.minPrice)) return false;
      if (filters.maxPrice && price > Number(filters.maxPrice)) return false;

      if (filters.checkIn && filters.checkOut) {
        if (!isValidDateRange(filters.checkIn, filters.checkOut)) return false;
        return isRoomAvailableForRange(room, filters.checkIn, filters.checkOut);
      }

      return true;
    });
  }, [rooms, filters, bookings]);

  const adminFilteredBookings = useMemo(() => {
    const keyword = bookingKeyword.trim().toLowerCase();
    if (!keyword) return bookings;

    return bookings.filter((b) => {
      const room = rooms.find((r) => r.id === b.roomId);
      const typeName = getRoomTypeName(b.roomTypeId).toLowerCase();
      const roomName = String(room?.roomName || b.roomName || "").toLowerCase();
      return (
        String(b.guestName || "").toLowerCase().includes(keyword) ||
        String(b.phone || "").toLowerCase().includes(keyword) ||
        String(b.status || "").toLowerCase().includes(keyword) ||
        roomName.includes(keyword) ||
        typeName.includes(keyword)
      );
    });
  }, [bookings, bookingKeyword, rooms, roomTypes]);

  /* =========================
     訊息
  ========================= */
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 2500);
    return () => clearTimeout(timer);
  }, [message]);

  /* =========================
     顧客功能
  ========================= */
  function openRoomDetail(room) {
    setSelectedRoom(room);
    setBookingForm((prev) => ({
      ...prev,
      checkIn: filters.checkIn || prev.checkIn,
      checkOut: filters.checkOut || prev.checkOut,
      guests: prev.guests || 1,
    }));
  }

  async function submitBooking() {
    if (!selectedRoom || !user?.uid) {
      setMessage("尚未完成登入或未選擇房間");
      return;
    }

    const payload = {
      guestName: bookingForm.guestName.trim(),
      phone: bookingForm.phone.trim(),
      checkIn: bookingForm.checkIn,
      checkOut: bookingForm.checkOut,
      guests: Number(bookingForm.guests),
      note: bookingForm.note.trim(),
    };

    if (!payload.guestName || !payload.phone || !payload.checkIn || !payload.checkOut || !payload.guests) {
      setMessage("請完整填寫訂房資料");
      return;
    }

    if (!isValidDateRange(payload.checkIn, payload.checkOut)) {
      setMessage("退房日期必須晚於入住日期");
      return;
    }

    if (payload.guests > Number(selectedRoom.capacity || 0)) {
      setMessage("入住人數超過房間可入住人數");
      return;
    }

    if (selectedRoom.status !== "可訂房") {
      setMessage("此房間目前不可訂房");
      return;
    }

    try {
      setBusy(true);

      const latestBookingDocs = await getDocs(
        query(collection(db, "bookings"), where("roomId", "==", selectedRoom.id))
      );

      const latestBookings = latestBookingDocs.docs.map((d) => ({ id: d.id, ...d.data() }));
      const hasOverlap = latestBookings.some(
        (booking) =>
          ACTIVE_BOOKING_STATUS.includes(booking.status) &&
          isOverlap(payload.checkIn, payload.checkOut, booking.checkIn, booking.checkOut)
      );

      if (hasOverlap) {
        setMessage("此房間在該日期區間已有有效訂單，無法重複訂房");
        return;
      }

      await addDoc(collection(db, "bookings"), {
        roomId: selectedRoom.id,
        roomTypeId: selectedRoom.roomTypeId,
        roomName: selectedRoom.roomName,
        guestName: payload.guestName,
        phone: payload.phone,
        checkIn: payload.checkIn,
        checkOut: payload.checkOut,
        guests: payload.guests,
        note: payload.note,
        status: "待確認",
        userId: user.uid,
        createdAt: serverTimestamp(),
      });

      setBookingForm(emptyBookingForm);
      setSelectedRoom(null);
      setMessage("訂房申請已送出");
    } catch (error) {
      console.error(error);
      setMessage("訂房失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  async function cancelMyBooking(bookingId) {
    try {
      setBusy(true);
      await updateDoc(doc(db, "bookings", bookingId), {
        status: "已取消",
        updatedAt: serverTimestamp(),
      });
      setMessage("訂單已取消");
    } catch (error) {
      console.error(error);
      setMessage("取消訂單失敗");
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     管理者功能：房型
  ========================= */
  async function saveRoomType() {
    if (!typeForm.name.trim()) {
      setMessage("請輸入房型名稱");
      return;
    }

    try {
      setBusy(true);

      if (editingTypeId) {
        await updateDoc(doc(db, "roomTypes", editingTypeId), {
          name: typeForm.name.trim(),
          description: typeForm.description.trim(),
          updatedAt: serverTimestamp(),
        });
        setMessage("房型已更新");
      } else {
        await addDoc(collection(db, "roomTypes"), {
          name: typeForm.name.trim(),
          description: typeForm.description.trim(),
          createdAt: serverTimestamp(),
        });
        setMessage("房型已新增");
      }

      setTypeForm(emptyTypeForm);
      setEditingTypeId("");
    } catch (error) {
      console.error(error);
      setMessage("儲存房型失敗");
    } finally {
      setBusy(false);
    }
  }

  function editRoomType(type) {
    setEditingTypeId(type.id);
    setTypeForm({
      name: type.name || "",
      description: type.description || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeRoomType(typeId) {
    const hasLinkedRoom = rooms.some((room) => room.roomTypeId === typeId);
    if (hasLinkedRoom) {
      setMessage("此房型仍有房間資料，請先刪除或修改相關房間");
      return;
    }

    const yes = window.confirm("確定要刪除此房型嗎？");
    if (!yes) return;

    try {
      setBusy(true);
      await deleteDoc(doc(db, "roomTypes", typeId));
      setMessage("房型已刪除");
    } catch (error) {
      console.error(error);
      setMessage("刪除房型失敗");
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     管理者功能：房間
  ========================= */
  async function saveRoom() {
    if (!roomForm.roomTypeId || !roomForm.roomName.trim() || !roomForm.price || !roomForm.capacity) {
      setMessage("請完整填寫房間資料");
      return;
    }

    try {
      setBusy(true);

      const data = {
        roomTypeId: roomForm.roomTypeId,
        roomName: roomForm.roomName.trim(),
        price: Number(roomForm.price),
        capacity: Number(roomForm.capacity),
        description: roomForm.description.trim(),
        facilities: toArrayFacilities(roomForm.facilities),
        status: roomForm.status,
        updatedAt: serverTimestamp(),
      };

      if (editingRoomId) {
        await updateDoc(doc(db, "rooms", editingRoomId), data);
        setMessage("房間已更新");
      } else {
        await addDoc(collection(db, "rooms"), {
          ...data,
          createdAt: serverTimestamp(),
        });
        setMessage("房間已新增");
      }

      setRoomForm(emptyRoomForm);
      setEditingRoomId("");
    } catch (error) {
      console.error(error);
      setMessage("儲存房間失敗");
    } finally {
      setBusy(false);
    }
  }

  function editRoom(room) {
    setEditingRoomId(room.id);
    setRoomForm({
      roomTypeId: room.roomTypeId || "",
      roomName: room.roomName || "",
      price: room.price || "",
      capacity: room.capacity || "",
      description: room.description || "",
      facilities: Array.isArray(room.facilities) ? room.facilities.join("、") : "",
      status: room.status || "可訂房",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeRoom(roomId) {
    const hasBooking = bookings.some((b) => b.roomId === roomId && b.status !== "已取消");
    if (hasBooking) {
      setMessage("此房間仍有訂單資料，請先處理相關訂單");
      return;
    }

    const yes = window.confirm("確定要刪除此房間嗎？");
    if (!yes) return;

    try {
      setBusy(true);
      await deleteDoc(doc(db, "rooms", roomId));
      setMessage("房間已刪除");
    } catch (error) {
      console.error(error);
      setMessage("刪除房間失敗");
    } finally {
      setBusy(false);
    }
  }

  async function updateRoomStatus(roomId, status) {
    try {
      setBusy(true);
      await updateDoc(doc(db, "rooms", roomId), {
        status,
        updatedAt: serverTimestamp(),
      });
      setMessage("房間狀態已更新");
    } catch (error) {
      console.error(error);
      setMessage("更新房間狀態失敗");
    } finally {
      setBusy(false);
    }
  }

  async function updateBookingStatus(bookingId, status) {
    try {
      setBusy(true);
      await updateDoc(doc(db, "bookings", bookingId), {
        status,
        updatedAt: serverTimestamp(),
      });
      setMessage("訂單狀態已更新");
    } catch (error) {
      console.error(error);
      setMessage("更新訂單狀態失敗");
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     樣式
  ========================= */
  const styles = {
    app: {
      minHeight: "100vh",
      background:
        "linear-gradient(180deg, #f7f9fc 0%, #eef3ff 45%, #f8fbff 100%)",
      color: "#1f2d3d",
      fontFamily:
        '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
    },
    container: {
      width: "min(1200px, calc(100% - 24px))",
      margin: "0 auto",
      padding: "24px 0 40px",
    },
    header: {
      background: "rgba(255,255,255,0.86)",
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(255,255,255,0.7)",
      borderRadius: 24,
      padding: 20,
      boxShadow: "0 10px 30px rgba(40, 60, 120, 0.08)",
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: 16,
      alignItems: "center",
      marginBottom: 20,
    },
    title: {
      fontSize: 28,
      fontWeight: 800,
      margin: 0,
      letterSpacing: "0.03em",
    },
    subtitle: {
      marginTop: 8,
      color: "#667085",
      fontSize: 14,
    },
    pillGroup: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      alignItems: "center",
    },
    tabBtn: (active) => ({
      border: "none",
      borderRadius: 999,
      padding: "10px 16px",
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer",
      background: active ? "#1f6feb" : "#edf2ff",
      color: active ? "#fff" : "#355070",
      boxShadow: active ? "0 8px 18px rgba(31,111,235,0.25)" : "none",
      transition: "0.2s ease",
    }),
    card: {
      background: "#fff",
      borderRadius: 22,
      border: "1px solid rgba(26, 58, 120, 0.08)",
      boxShadow: "0 12px 30px rgba(30, 48, 90, 0.07)",
      padding: 18,
    },
    sectionTitle: {
      margin: "0 0 12px",
      fontSize: 20,
      fontWeight: 800,
    },
    grid2: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      gap: 16,
    },
    grid3: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 12,
    },
    input: {
      width: "100%",
      boxSizing: "border-box",
      borderRadius: 14,
      border: "1px solid #d8e0f0",
      background: "#f9fbff",
      padding: "12px 14px",
      fontSize: 14,
      outline: "none",
    },
    label: {
      display: "block",
      marginBottom: 8,
      fontSize: 13,
      fontWeight: 700,
      color: "#475467",
    },
    fieldWrap: {
      marginBottom: 12,
    },
    textarea: {
      width: "100%",
      minHeight: 100,
      boxSizing: "border-box",
      borderRadius: 14,
      border: "1px solid #d8e0f0",
      background: "#f9fbff",
      padding: "12px 14px",
      fontSize: 14,
      outline: "none",
      resize: "vertical",
    },
    primaryBtn: {
      border: "none",
      borderRadius: 14,
      padding: "12px 18px",
      cursor: "pointer",
      background: "linear-gradient(135deg, #1f6feb 0%, #6f7dff 100%)",
      color: "#fff",
      fontWeight: 800,
      fontSize: 14,
      boxShadow: "0 12px 24px rgba(50,90,220,0.22)",
    },
    secondaryBtn: {
      border: "1px solid #d8e0f0",
      borderRadius: 14,
      padding: "12px 18px",
      cursor: "pointer",
      background: "#fff",
      color: "#344054",
      fontWeight: 700,
      fontSize: 14,
    },
    dangerBtn: {
      border: "none",
      borderRadius: 12,
      padding: "10px 14px",
      cursor: "pointer",
      background: "#d92d20",
      color: "#fff",
      fontWeight: 700,
      fontSize: 13,
    },
    roomCard: {
      background: "#fff",
      borderRadius: 22,
      border: "1px solid rgba(26, 58, 120, 0.08)",
      boxShadow: "0 12px 30px rgba(30, 48, 90, 0.07)",
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    },
    badge: (status) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      width: "fit-content",
      padding: "6px 12px",
      borderRadius: 999,
      background: `${statusColor(status)}14`,
      color: statusColor(status),
      fontSize: 12,
      fontWeight: 800,
    }),
    roomTitle: {
      fontSize: 20,
      fontWeight: 800,
      margin: 0,
    },
    muted: {
      color: "#667085",
      fontSize: 14,
    },
    metaWrap: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 10,
    },
    metaBox: {
      borderRadius: 16,
      background: "#f8fbff",
      border: "1px solid #e6eefb",
      padding: 12,
    },
    metaLabel: {
      fontSize: 12,
      color: "#667085",
      marginBottom: 6,
      fontWeight: 700,
    },
    metaValue: {
      fontSize: 16,
      fontWeight: 800,
      color: "#243b53",
    },
    flexBetween: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    },
    orderCard: {
      borderRadius: 18,
      border: "1px solid #e5eaf6",
      background: "#fff",
      padding: 16,
      display: "grid",
      gap: 10,
    },
    smallBtn: {
      border: "1px solid #d8e0f0",
      background: "#fff",
      borderRadius: 10,
      padding: "8px 12px",
      fontSize: 13,
      cursor: "pointer",
      fontWeight: 700,
      color: "#344054",
    },
    tableWrap: {
      overflowX: "auto",
      borderRadius: 18,
      border: "1px solid #e4e9f5",
      background: "#fff",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      minWidth: 900,
    },
    th: {
      textAlign: "left",
      padding: "14px 12px",
      fontSize: 13,
      color: "#475467",
      background: "#f8fbff",
      borderBottom: "1px solid #e4e9f5",
      whiteSpace: "nowrap",
    },
    td: {
      padding: "14px 12px",
      borderBottom: "1px solid #eef2f8",
      fontSize: 14,
      verticalAlign: "top",
    },
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(245,248,255,0.92)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      flexDirection: "column",
      gap: 16,
      fontWeight: 800,
      color: "#23395d",
      fontSize: 22,
    },
    spinner: {
      width: 58,
      height: 58,
      borderRadius: "50%",
      border: "6px solid #dbe7ff",
      borderTopColor: "#1f6feb",
      animation: "spin 1s linear infinite",
    },
    toast: {
      position: "fixed",
      right: 18,
      bottom: 18,
      zIndex: 9998,
      background: "#162033",
      color: "#fff",
      padding: "12px 16px",
      borderRadius: 14,
      boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
      fontSize: 14,
      fontWeight: 700,
    },
    modalBackdrop: {
      position: "fixed",
      inset: 0,
      background: "rgba(16,24,40,0.48)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 14,
      zIndex: 9997,
    },
    modalCard: {
      width: "min(900px, 100%)",
      maxHeight: "90vh",
      overflowY: "auto",
      background: "#fff",
      borderRadius: 24,
      padding: 22,
      boxShadow: "0 30px 80px rgba(0,0,0,0.22)",
    },
    emptyBox: {
      borderRadius: 20,
      border: "1px dashed #cbd5e1",
      background: "#f8fbff",
      padding: 24,
      textAlign: "center",
      color: "#667085",
      fontWeight: 700,
    },
    inlineAction: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      alignItems: "center",
    },
    loginPage: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      background:
        "linear-gradient(135deg, #eaf2ff 0%, #f8fbff 40%, #eef3ff 100%)",
    },
    loginCard: {
      width: "min(760px, 100%)",
      background: "rgba(255,255,255,0.92)",
      border: "1px solid rgba(255,255,255,0.85)",
      backdropFilter: "blur(12px)",
      borderRadius: 30,
      padding: 28,
      boxShadow: "0 25px 80px rgba(41, 72, 152, 0.14)",
    },
    loginTitle: {
      fontSize: 34,
      fontWeight: 900,
      margin: "0 0 8px",
      textAlign: "center",
      color: "#20324d",
    },
    loginSubTitle: {
      textAlign: "center",
      color: "#667085",
      marginBottom: 24,
      fontSize: 15,
    },
    loginGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      gap: 18,
    },
    loginRoleCard: {
      borderRadius: 24,
      padding: 22,
      background: "#fff",
      border: "1px solid #e7eefc",
      boxShadow: "0 14px 30px rgba(30, 48, 90, 0.07)",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    },
    loginRoleTitle: {
      fontSize: 22,
      fontWeight: 900,
      margin: 0,
    },
    loginRoleDesc: {
      color: "#667085",
      fontSize: 14,
      lineHeight: 1.7,
      minHeight: 72,
    },
  };

  const isLoggedIn = !!role && !!uiMode && !!user;

  return (
    <div style={styles.app}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .responsive-two {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 16px;
        }
        @media (max-width: 900px) {
          .responsive-two {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {loadingOverlay && (
        <div style={styles.overlay}>
          <div style={styles.spinner} />
          <div>系統載入中...</div>
        </div>
      )}

      {message && <div style={styles.toast}>{message}</div>}

      {!isLoggedIn ? (
        <div style={styles.loginPage}>
          <div style={styles.loginCard}>
            <h1 style={styles.loginTitle}>民宿訂房系統</h1>
            <div style={styles.loginSubTitle}>
              請先選擇登入身分，系統會帶你進入對應的操作畫面
            </div>

            <div style={styles.loginGrid}>
              <div style={styles.loginRoleCard}>
                <h2 style={styles.loginRoleTitle}>顧客登入</h2>
                <div style={styles.loginRoleDesc}>
                  可瀏覽房型與房間、查詢空房、提交訂房申請，並查看與取消自己的訂單。
                </div>
                <button
                  style={styles.primaryBtn}
                  onClick={() => handleRoleLogin("customer")}
                  disabled={busy}
                >
                  以顧客身分進入訂房畫面
                </button>
              </div>

              <div style={styles.loginRoleCard}>
                <h2 style={styles.loginRoleTitle}>管理員登入</h2>
                <div style={styles.loginRoleDesc}>
                  可管理房型與房間資料、查看所有訂單、修改房間狀態與訂單狀態。
                </div>
                <button
                  style={styles.primaryBtn}
                  onClick={() => handleRoleLogin("admin")}
                  disabled={busy}
                >
                  以管理員身分進入管理畫面
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
              <div>
                <h1 style={styles.title}>民宿訂房系統</h1>
                <div style={styles.subtitle}>
                  {role === "customer"
                    ? "目前登入身分：顧客"
                    : "目前登入身分：管理員"}
                </div>
              </div>

              <div style={styles.pillGroup}>
                <div style={{ ...styles.badge("已確認"), background: "#edf4ff", color: "#1f6feb" }}>
                  身分：{role === "customer" ? "顧客" : "管理員"}
                </div>
                <div style={{ ...styles.badge("已確認"), background: "#f5f8ff", color: "#4b5d79" }}>
                  UID：{user?.uid ? `${user.uid.slice(0, 10)}...` : "未登入"}
                </div>
                <button style={styles.secondaryBtn} onClick={handleLogout}>
                  登出
                </button>
              </div>
            </div>

            {/* 顧客端 */}
            {uiMode === "customer" && (
              <>
                <div style={{ ...styles.card, marginBottom: 18 }}>
                  <div style={styles.flexBetween}>
                    <h2 style={styles.sectionTitle}>搜尋與篩選空房</h2>
                    <button
                      style={styles.secondaryBtn}
                      onClick={() =>
                        setFilters({
                          checkIn: "",
                          checkOut: "",
                          roomTypeId: "",
                          minPrice: "",
                          maxPrice: "",
                        })
                      }
                    >
                      清除條件
                    </button>
                  </div>

                  <div style={styles.grid3}>
                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>入住日期</label>
                      <input
                        type="date"
                        style={styles.input}
                        value={filters.checkIn}
                        min={todayStr()}
                        onChange={(e) => setFilters((prev) => ({ ...prev, checkIn: e.target.value }))}
                      />
                    </div>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>退房日期</label>
                      <input
                        type="date"
                        style={styles.input}
                        value={filters.checkOut}
                        min={filters.checkIn || todayStr()}
                        onChange={(e) => setFilters((prev) => ({ ...prev, checkOut: e.target.value }))}
                      />
                    </div>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>房型</label>
                      <select
                        style={styles.input}
                        value={filters.roomTypeId}
                        onChange={(e) => setFilters((prev) => ({ ...prev, roomTypeId: e.target.value }))}
                      >
                        <option value="">全部房型</option>
                        {roomTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>最低價格</label>
                      <input
                        type="number"
                        style={styles.input}
                        placeholder="例如 2000"
                        value={filters.minPrice}
                        onChange={(e) => setFilters((prev) => ({ ...prev, minPrice: e.target.value }))}
                      />
                    </div>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>最高價格</label>
                      <input
                        type="number"
                        style={styles.input}
                        placeholder="例如 5000"
                        value={filters.maxPrice}
                        onChange={(e) => setFilters((prev) => ({ ...prev, maxPrice: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ ...styles.flexBetween, marginBottom: 14 }}>
                  <h2 style={styles.sectionTitle}>房型與房間列表</h2>
                  <div style={styles.muted}>共 {filteredRooms.length} 間房</div>
                </div>

                {filteredRooms.length === 0 ? (
                  <div style={styles.emptyBox}>目前沒有符合條件的房間</div>
                ) : (
                  <div style={styles.grid2}>
                    {filteredRooms.map((room) => {
                      const typeName = getRoomTypeName(room.roomTypeId);
                      const effectiveStatus =
                        filters.checkIn && filters.checkOut
                          ? isRoomAvailableForRange(room, filters.checkIn, filters.checkOut)
                            ? "可訂房"
                            : room.status === "停用"
                            ? "停用"
                            : "已被預訂"
                          : room.status;

                      return (
                        <div key={room.id} style={styles.roomCard}>
                          <div style={styles.flexBetween}>
                            <div>
                              <div style={{ ...styles.muted, marginBottom: 4 }}>{typeName}</div>
                              <h3 style={styles.roomTitle}>{room.roomName}</h3>
                            </div>
                            <span style={styles.badge(effectiveStatus)}>{effectiveStatus}</span>
                          </div>

                          <div style={styles.metaWrap}>
                            <div style={styles.metaBox}>
                              <div style={styles.metaLabel}>價格</div>
                              <div style={styles.metaValue}>{formatPrice(room.price)}</div>
                            </div>
                            <div style={styles.metaBox}>
                              <div style={styles.metaLabel}>可入住人數</div>
                              <div style={styles.metaValue}>{room.capacity} 人</div>
                            </div>
                          </div>

                          <div style={styles.muted}>
                            {room.description || "尚未填寫房間描述"}
                          </div>

                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button style={styles.primaryBtn} onClick={() => openRoomDetail(room)}>
                              查看詳細資訊 / 訂房
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ height: 22 }} />

                <div style={styles.card}>
                  <div style={styles.flexBetween}>
                    <h2 style={styles.sectionTitle}>我的訂單</h2>
                    <div style={styles.muted}>可取消尚未入住的訂單</div>
                  </div>

                  {myBookings.length === 0 ? (
                    <div style={styles.emptyBox}>目前沒有你的訂單資料</div>
                  ) : (
                    <div style={styles.grid2}>
                      {myBookings.map((booking) => {
                        const room = rooms.find((r) => r.id === booking.roomId);
                        return (
                          <div key={booking.id} style={styles.orderCard}>
                            <div style={styles.flexBetween}>
                              <div>
                                <div style={{ ...styles.muted, marginBottom: 4 }}>
                                  {getRoomTypeName(booking.roomTypeId)}
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 800 }}>
                                  {room?.roomName || booking.roomName || "房間已刪除"}
                                </div>
                              </div>
                              <span style={styles.badge(booking.status)}>{booking.status}</span>
                            </div>

                            <div style={styles.grid3}>
                              <div>
                                <div style={styles.metaLabel}>訂房人</div>
                                <div>{booking.guestName}</div>
                              </div>
                              <div>
                                <div style={styles.metaLabel}>電話</div>
                                <div>{booking.phone}</div>
                              </div>
                              <div>
                                <div style={styles.metaLabel}>入住 / 退房</div>
                                <div>
                                  {booking.checkIn} ～ {booking.checkOut}
                                </div>
                              </div>
                              <div>
                                <div style={styles.metaLabel}>入住人數</div>
                                <div>{booking.guests} 人</div>
                              </div>
                            </div>

                            <div style={styles.muted}>備註：{booking.note || "無"}</div>

                            {canCancelBooking(booking) && (
                              <div>
                                <button
                                  style={styles.dangerBtn}
                                  onClick={() => cancelMyBooking(booking.id)}
                                  disabled={busy}
                                >
                                  取消訂單
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 管理者端 */}
            {uiMode === "admin" && (
              <>
                <div className="responsive-two" style={{ marginBottom: 18 }}>
                  <div style={styles.card}>
                    <div style={styles.flexBetween}>
                      <h2 style={styles.sectionTitle}>房型管理</h2>
                      {editingTypeId && (
                        <button
                          style={styles.secondaryBtn}
                          onClick={() => {
                            setEditingTypeId("");
                            setTypeForm(emptyTypeForm);
                          }}
                        >
                          取消編輯
                        </button>
                      )}
                    </div>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>房型名稱</label>
                      <input
                        style={styles.input}
                        value={typeForm.name}
                        onChange={(e) => setTypeForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="例如：雙人房、四人房、家庭套房"
                      />
                    </div>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>房型描述</label>
                      <textarea
                        style={styles.textarea}
                        value={typeForm.description}
                        onChange={(e) => setTypeForm((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder="房型說明..."
                      />
                    </div>

                    <button style={styles.primaryBtn} onClick={saveRoomType} disabled={busy}>
                      {editingTypeId ? "更新房型" : "新增房型"}
                    </button>

                    <div style={{ height: 16 }} />

                    <div style={{ display: "grid", gap: 12 }}>
                      {roomTypes.length === 0 ? (
                        <div style={styles.emptyBox}>尚未建立房型資料</div>
                      ) : (
                        roomTypes.map((type) => (
                          <div key={type.id} style={styles.orderCard}>
                            <div style={styles.flexBetween}>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: 17 }}>{type.name}</div>
                                <div style={styles.muted}>{type.description || "無描述"}</div>
                              </div>
                              <div style={styles.inlineAction}>
                                <button style={styles.smallBtn} onClick={() => editRoomType(type)}>
                                  編輯
                                </button>
                                <button
                                  style={styles.dangerBtn}
                                  onClick={() => removeRoomType(type.id)}
                                >
                                  刪除
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div style={styles.card}>
                    <div style={styles.flexBetween}>
                      <h2 style={styles.sectionTitle}>房間管理</h2>
                      {editingRoomId && (
                        <button
                          style={styles.secondaryBtn}
                          onClick={() => {
                            setEditingRoomId("");
                            setRoomForm(emptyRoomForm);
                          }}
                        >
                          取消編輯
                        </button>
                      )}
                    </div>

                    <div style={styles.grid3}>
                      <div style={styles.fieldWrap}>
                        <label style={styles.label}>房型</label>
                        <select
                          style={styles.input}
                          value={roomForm.roomTypeId}
                          onChange={(e) => setRoomForm((prev) => ({ ...prev, roomTypeId: e.target.value }))}
                        >
                          <option value="">請選擇房型</option>
                          {roomTypes.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={styles.fieldWrap}>
                        <label style={styles.label}>房間名稱 / 編號</label>
                        <input
                          style={styles.input}
                          value={roomForm.roomName}
                          onChange={(e) => setRoomForm((prev) => ({ ...prev, roomName: e.target.value }))}
                          placeholder="例如 201 / 星空雙人房"
                        />
                      </div>

                      <div style={styles.fieldWrap}>
                        <label style={styles.label}>狀態</label>
                        <select
                          style={styles.input}
                          value={roomForm.status}
                          onChange={(e) => setRoomForm((prev) => ({ ...prev, status: e.target.value }))}
                        >
                          {ROOM_STATUS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={styles.fieldWrap}>
                        <label style={styles.label}>價格</label>
                        <input
                          type="number"
                          style={styles.input}
                          value={roomForm.price}
                          onChange={(e) => setRoomForm((prev) => ({ ...prev, price: e.target.value }))}
                          placeholder="例如 2800"
                        />
                      </div>

                      <div style={styles.fieldWrap}>
                        <label style={styles.label}>可入住人數</label>
                        <input
                          type="number"
                          style={styles.input}
                          value={roomForm.capacity}
                          onChange={(e) => setRoomForm((prev) => ({ ...prev, capacity: e.target.value }))}
                          placeholder="例如 2"
                        />
                      </div>
                    </div>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>房間描述</label>
                      <textarea
                        style={styles.textarea}
                        value={roomForm.description}
                        onChange={(e) => setRoomForm((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder="輸入房間特色、床型、景觀等"
                      />
                    </div>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>設施（以頓號、逗號或換行分隔）</label>
                      <textarea
                        style={styles.textarea}
                        value={roomForm.facilities}
                        onChange={(e) => setRoomForm((prev) => ({ ...prev, facilities: e.target.value }))}
                        placeholder="Wi-Fi、冷氣、電視、吹風機、獨立衛浴"
                      />
                    </div>

                    <button style={styles.primaryBtn} onClick={saveRoom} disabled={busy}>
                      {editingRoomId ? "更新房間" : "新增房間"}
                    </button>
                  </div>
                </div>

                <div style={{ ...styles.card, marginBottom: 18 }}>
                  <div style={styles.flexBetween}>
                    <h2 style={styles.sectionTitle}>所有房間</h2>
                    <div style={styles.muted}>可直接調整房間狀態</div>
                  </div>

                  {rooms.length === 0 ? (
                    <div style={styles.emptyBox}>尚未建立房間資料</div>
                  ) : (
                    <div style={styles.tableWrap}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={styles.th}>房型</th>
                            <th style={styles.th}>房間</th>
                            <th style={styles.th}>價格</th>
                            <th style={styles.th}>可入住人數</th>
                            <th style={styles.th}>房間狀態</th>
                            <th style={styles.th}>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rooms.map((room) => (
                            <tr key={room.id}>
                              <td style={styles.td}>{getRoomTypeName(room.roomTypeId)}</td>
                              <td style={styles.td}>
                                <div style={{ fontWeight: 800 }}>{room.roomName}</div>
                                <div style={styles.muted}>{room.description || "無描述"}</div>
                              </td>
                              <td style={styles.td}>{formatPrice(room.price)}</td>
                              <td style={styles.td}>{room.capacity} 人</td>
                              <td style={styles.td}>
                                <select
                                  style={styles.input}
                                  value={room.status}
                                  onChange={(e) => updateRoomStatus(room.id, e.target.value)}
                                >
                                  {ROOM_STATUS.map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td style={styles.td}>
                                <div style={styles.inlineAction}>
                                  <button style={styles.smallBtn} onClick={() => editRoom(room)}>
                                    編輯
                                  </button>
                                  <button
                                    style={styles.dangerBtn}
                                    onClick={() => removeRoom(room.id)}
                                  >
                                    刪除
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div style={styles.card}>
                  <div style={styles.flexBetween}>
                    <h2 style={styles.sectionTitle}>所有訂單</h2>
                    <div style={{ width: 280, maxWidth: "100%" }}>
                      <input
                        style={styles.input}
                        value={bookingKeyword}
                        onChange={(e) => setBookingKeyword(e.target.value)}
                        placeholder="搜尋姓名、電話、房型、房間、狀態"
                      />
                    </div>
                  </div>

                  {adminFilteredBookings.length === 0 ? (
                    <div style={styles.emptyBox}>目前沒有符合條件的訂單</div>
                  ) : (
                    <div style={styles.tableWrap}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={styles.th}>訂房人</th>
                            <th style={styles.th}>電話</th>
                            <th style={styles.th}>房型 / 房間</th>
                            <th style={styles.th}>入住日期</th>
                            <th style={styles.th}>退房日期</th>
                            <th style={styles.th}>入住人數</th>
                            <th style={styles.th}>備註</th>
                            <th style={styles.th}>訂單狀態</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminFilteredBookings.map((booking) => {
                            const room = rooms.find((r) => r.id === booking.roomId);
                            return (
                              <tr key={booking.id}>
                                <td style={styles.td}>{booking.guestName}</td>
                                <td style={styles.td}>{booking.phone}</td>
                                <td style={styles.td}>
                                  <div style={{ fontWeight: 800 }}>
                                    {getRoomTypeName(booking.roomTypeId)}
                                  </div>
                                  <div style={styles.muted}>
                                    {room?.roomName || booking.roomName || "房間已刪除"}
                                  </div>
                                </td>
                                <td style={styles.td}>{booking.checkIn}</td>
                                <td style={styles.td}>{booking.checkOut}</td>
                                <td style={styles.td}>{booking.guests} 人</td>
                                <td style={styles.td}>{booking.note || "無"}</td>
                                <td style={styles.td}>
                                  <select
                                    style={styles.input}
                                    value={booking.status}
                                    onChange={(e) => updateBookingStatus(booking.id, e.target.value)}
                                  >
                                    {BOOKING_STATUS.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {selectedRoom && (
            <div style={styles.modalBackdrop} onClick={() => setSelectedRoom(null)}>
              <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                <div style={{ ...styles.flexBetween, marginBottom: 14 }}>
                  <div>
                    <div style={{ ...styles.muted, marginBottom: 6 }}>
                      {getRoomTypeName(selectedRoom.roomTypeId)}
                    </div>
                    <h2 style={{ ...styles.sectionTitle, marginBottom: 0 }}>
                      {selectedRoom.roomName}
                    </h2>
                  </div>
                  <button style={styles.secondaryBtn} onClick={() => setSelectedRoom(null)}>
                    關閉
                  </button>
                </div>

                <div className="responsive-two">
                  <div style={styles.card}>
                    <div style={{ ...styles.badge(selectedRoom.status), marginBottom: 12 }}>
                      {selectedRoom.status}
                    </div>

                    <div style={styles.metaWrap}>
                      <div style={styles.metaBox}>
                        <div style={styles.metaLabel}>價格</div>
                        <div style={styles.metaValue}>{formatPrice(selectedRoom.price)}</div>
                      </div>
                      <div style={styles.metaBox}>
                        <div style={styles.metaLabel}>可入住人數</div>
                        <div style={styles.metaValue}>{selectedRoom.capacity} 人</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div style={styles.label}>房間描述</div>
                      <div style={styles.muted}>
                        {selectedRoom.description || "尚未填寫描述"}
                      </div>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div style={styles.label}>設施</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {Array.isArray(selectedRoom.facilities) && selectedRoom.facilities.length > 0 ? (
                          selectedRoom.facilities.map((item, index) => (
                            <span
                              key={`${item}-${index}`}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 999,
                                background: "#f3f7ff",
                                border: "1px solid #dbe7ff",
                                fontSize: 13,
                                fontWeight: 700,
                                color: "#355070",
                              }}
                            >
                              {item}
                            </span>
                          ))
                        ) : (
                          <div style={styles.muted}>尚未設定設施</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={styles.card}>
                    <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 800 }}>
                      提交訂房申請
                    </h3>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>訂房人姓名</label>
                      <input
                        style={styles.input}
                        value={bookingForm.guestName}
                        onChange={(e) =>
                          setBookingForm((prev) => ({ ...prev, guestName: e.target.value }))
                        }
                      />
                    </div>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>電話</label>
                      <input
                        style={styles.input}
                        value={bookingForm.phone}
                        onChange={(e) =>
                          setBookingForm((prev) => ({ ...prev, phone: e.target.value }))
                        }
                      />
                    </div>

                    <div style={styles.grid3}>
                      <div style={styles.fieldWrap}>
                        <label style={styles.label}>入住日期</label>
                        <input
                          type="date"
                          style={styles.input}
                          value={bookingForm.checkIn}
                          min={todayStr()}
                          onChange={(e) =>
                            setBookingForm((prev) => ({ ...prev, checkIn: e.target.value }))
                          }
                        />
                      </div>

                      <div style={styles.fieldWrap}>
                        <label style={styles.label}>退房日期</label>
                        <input
                          type="date"
                          style={styles.input}
                          value={bookingForm.checkOut}
                          min={bookingForm.checkIn || todayStr()}
                          onChange={(e) =>
                            setBookingForm((prev) => ({ ...prev, checkOut: e.target.value }))
                          }
                        />
                      </div>

                      <div style={styles.fieldWrap}>
                        <label style={styles.label}>入住人數</label>
                        <input
                          type="number"
                          min="1"
                          max={selectedRoom.capacity}
                          style={styles.input}
                          value={bookingForm.guests}
                          onChange={(e) =>
                            setBookingForm((prev) => ({ ...prev, guests: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>備註</label>
                      <textarea
                        style={styles.textarea}
                        value={bookingForm.note}
                        onChange={(e) =>
                          setBookingForm((prev) => ({ ...prev, note: e.target.value }))
                        }
                        placeholder="特殊需求、抵達時間等"
                      />
                    </div>

                    <button style={styles.primaryBtn} onClick={submitBooking} disabled={busy}>
                      送出訂房申請
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {busy && !loadingOverlay && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(255,255,255,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9996,
              }}
            >
              <div style={styles.card}>資料處理中...</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
