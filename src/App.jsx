import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCdaGbqhxBjkO43elRRtu8G7UWARU9xHmM",
  authDomain: "my-rental-app-59210.firebaseapp.com",
  projectId: "my-rental-app-59210",
  storageBucket: "my-rental-app-59210.firebasestorage.app",
  messagingSenderId: "131975571748",
  appId: "1:131975571748:web:24ea4a464a8b0d97cdebb1",
  measurementId: "G-X51XB29V66",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ROOM_STATUS = {
  AVAILABLE: "可訂房",
  BOOKED: "已被預訂",
  DISABLED: "停用",
};

const BOOKING_STATUS = {
  PENDING: "待確認",
  CONFIRMED: "已確認",
  CANCELED: "已取消",
  CHECKED_IN: "已入住",
};

const ACTIVE_BOOKING_STATUSES = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.CHECKED_IN,
];

const initialRoomTypeForm = {
  name: "",
  description: "",
};

const initialRoomForm = {
  typeId: "",
  name: "",
  description: "",
  price: "",
  capacity: "",
  amenities: "",
  status: ROOM_STATUS.AVAILABLE,
};

const initialBookingForm = {
  customerName: "",
  phone: "",
  checkInDate: "",
  checkOutDate: "",
  guests: 1,
  note: "",
};

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return dateStr;
}

function isDateRangeOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  return new Date(startA) < new Date(endB) && new Date(startB) < new Date(endA);
}

function canCancelBooking(booking) {
  if (!booking) return false;
  if (
    booking.status !== BOOKING_STATUS.PENDING &&
    booking.status !== BOOKING_STATUS.CONFIRMED
  ) {
    return false;
  }
  const today = new Date();
  const checkIn = new Date(booking.checkInDate);
  today.setHours(0, 0, 0, 0);
  checkIn.setHours(0, 0, 0, 0);
  return checkIn >= today;
}

function toDateValue(value) {
  if (!value) return "";
  return value;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [roleView, setRoleView] = useState(
    localStorage.getItem("bnb_role_view") || "customer"
  );

  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [searchTypeId, setSearchTypeId] = useState("");
  const [searchCheckIn, setSearchCheckIn] = useState("");
  const [searchCheckOut, setSearchCheckOut] = useState("");

  const [selectedRoom, setSelectedRoom] = useState(null);
  const [bookingForm, setBookingForm] = useState(initialBookingForm);
  const [myOrdersOnly, setMyOrdersOnly] = useState(true);

  const [roomTypeForm, setRoomTypeForm] = useState(initialRoomTypeForm);
  const [editingRoomTypeId, setEditingRoomTypeId] = useState("");

  const [roomForm, setRoomForm] = useState(initialRoomForm);
  const [editingRoomId, setEditingRoomId] = useState("");

  const [message, setMessage] = useState("");
  const [submittingBooking, setSubmittingBooking] = useState(false);

  useEffect(() => {
    localStorage.setItem("bnb_role_view", roleView);
  }, [roleView]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          setCurrentUser(user);
          localStorage.setItem("bnb_auth_uid", user.uid);
        } else {
          const storedUid = localStorage.getItem("bnb_auth_uid");
          if (!storedUid) {
            const result = await signInAnonymously(auth);
            setCurrentUser(result.user);
            localStorage.setItem("bnb_auth_uid", result.user.uid);
          } else {
            const result = await signInAnonymously(auth);
            setCurrentUser(result.user);
            localStorage.setItem("bnb_auth_uid", result.user.uid);
          }
        }
      } catch (error) {
        console.error("匿名登入失敗：", error);
        setMessage("匿名登入失敗，請檢查 Firebase 設定。");
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    fetchAllData();
  }, [authReady]);

  async function fetchAllData() {
    setLoading(true);
    try {
      await Promise.all([fetchRoomTypes(), fetchRooms(), fetchBookings()]);
    } catch (error) {
      console.error("載入資料失敗：", error);
      setMessage("資料載入失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  async function fetchRoomTypes() {
    const snapshot = await getDocs(query(collection(db, "roomTypes"), orderBy("name", "asc")));
    const data = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    setRoomTypes(data);
  }

  async function fetchRooms() {
    const snapshot = await getDocs(query(collection(db, "rooms"), orderBy("createdAt", "desc")));
    const data = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    setRooms(data);
  }

  async function fetchBookings() {
    const snapshot = await getDocs(
      query(collection(db, "bookings"), orderBy("createdAt", "desc"))
    );
    const data = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    setBookings(data);
  }

  function getRoomTypeName(typeId) {
    const type = roomTypes.find((item) => item.id === typeId);
    return type?.name || "未分類房型";
  }

  function getRoomTypeDescription(typeId) {
    const type = roomTypes.find((item) => item.id === typeId);
    return type?.description || "";
  }

  const roomIdToTypeNameMap = useMemo(() => {
    const map = {};
    rooms.forEach((room) => {
      map[room.id] = getRoomTypeName(room.typeId);
    });
    return map;
  }, [rooms, roomTypes]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (searchTypeId && room.typeId !== searchTypeId) return false;
      if (room.status === ROOM_STATUS.DISABLED) return false;

      if (searchCheckIn && searchCheckOut) {
        const hasConflict = bookings.some((booking) => {
          return (
            booking.roomId === room.id &&
            ACTIVE_BOOKING_STATUSES.includes(booking.status) &&
            isDateRangeOverlap(
              searchCheckIn,
              searchCheckOut,
              booking.checkInDate,
              booking.checkOutDate
            )
          );
        });
        if (hasConflict) return false;
      }

      return true;
    });
  }, [rooms, bookings, searchTypeId, searchCheckIn, searchCheckOut]);

  const customerOrders = useMemo(() => {
    if (!currentUser) return [];
    return bookings
      .filter((booking) => {
        if (!myOrdersOnly) return true;
        return booking.userId === currentUser.uid;
      })
      .sort((a, b) => {
        const dateA = new Date(a.checkInDate || a.createdAt?.seconds * 1000 || 0);
        const dateB = new Date(b.checkInDate || b.createdAt?.seconds * 1000 || 0);
        return dateA - dateB;
      });
  }, [bookings, currentUser, myOrdersOnly]);

  async function handleSelectRoom(room) {
    setSelectedRoom(room);
    setBookingForm({
      ...initialBookingForm,
      checkInDate: searchCheckIn || "",
      checkOutDate: searchCheckOut || "",
      guests: 1,
    });
    setMessage("");
  }

  async function handleCreateBooking(e) {
    e.preventDefault();
    if (!selectedRoom || !currentUser) {
      setMessage("請先選擇房間。");
      return;
    }

    const { customerName, phone, checkInDate, checkOutDate, guests, note } = bookingForm;

    if (!customerName || !phone || !checkInDate || !checkOutDate || !guests) {
      setMessage("請完整填寫訂房資料。");
      return;
    }

    if (new Date(checkInDate) >= new Date(checkOutDate)) {
      setMessage("退房日期必須晚於入住日期。");
      return;
    }

    if (Number(guests) > Number(selectedRoom.capacity)) {
      setMessage("入住人數不可超過房間可入住人數。");
      return;
    }

    if (selectedRoom.status !== ROOM_STATUS.AVAILABLE) {
      setMessage("此房間目前不可預訂。");
      return;
    }

    setSubmittingBooking(true);
    setMessage("");

    try {
      const bookingCollection = collection(db, "bookings");

      const overlapQuery = query(
        bookingCollection,
        where("roomId", "==", selectedRoom.id)
      );

      const overlapSnapshot = await getDocs(overlapQuery);
      const existingBookings = overlapSnapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      const hasConflict = existingBookings.some((booking) => {
        return (
          ACTIVE_BOOKING_STATUSES.includes(booking.status) &&
          isDateRangeOverlap(
            checkInDate,
            checkOutDate,
            booking.checkInDate,
            booking.checkOutDate
          )
        );
      });

      if (hasConflict) {
        setMessage("該房間在此日期區間已有有效訂單，請重新選擇日期或房間。");
        setSubmittingBooking(false);
        return;
      }

      await addDoc(collection(db, "bookings"), {
        userId: currentUser.uid,
        customerName,
        phone,
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        roomTypeId: selectedRoom.typeId,
        roomTypeName: getRoomTypeName(selectedRoom.typeId),
        price: Number(selectedRoom.price),
        checkInDate,
        checkOutDate,
        guests: Number(guests),
        note: note || "",
        status: BOOKING_STATUS.PENDING,
        createdAt: serverTimestamp(),
      });

      await fetchBookings();
      setBookingForm(initialBookingForm);
      setSelectedRoom(null);
      setMessage("訂房申請已送出。");
    } catch (error) {
      console.error("建立訂單失敗：", error);
      setMessage("建立訂單失敗，請稍後再試。");
    } finally {
      setSubmittingBooking(false);
    }
  }

  async function handleCancelBooking(bookingId) {
    try {
      await updateDoc(doc(db, "bookings", bookingId), {
        status: BOOKING_STATUS.CANCELED,
      });
      await fetchBookings();
      setMessage("訂單已取消。");
    } catch (error) {
      console.error("取消訂單失敗：", error);
      setMessage("取消訂單失敗。");
    }
  }

  async function handleRoomTypeSubmit(e) {
    e.preventDefault();
    if (!roomTypeForm.name.trim()) {
      setMessage("請輸入房型名稱。");
      return;
    }

    try {
      if (editingRoomTypeId) {
        await updateDoc(doc(db, "roomTypes", editingRoomTypeId), {
          name: roomTypeForm.name.trim(),
          description: roomTypeForm.description.trim(),
        });
        setMessage("房型已更新。");
      } else {
        await addDoc(collection(db, "roomTypes"), {
          name: roomTypeForm.name.trim(),
          description: roomTypeForm.description.trim(),
          createdAt: serverTimestamp(),
        });
        setMessage("房型已新增。");
      }

      setRoomTypeForm(initialRoomTypeForm);
      setEditingRoomTypeId("");
      await fetchRoomTypes();
    } catch (error) {
      console.error("房型儲存失敗：", error);
      setMessage("房型儲存失敗。");
    }
  }

  function handleEditRoomType(type) {
    setEditingRoomTypeId(type.id);
    setRoomTypeForm({
      name: type.name || "",
      description: type.description || "",
    });
  }

  async function handleDeleteRoomType(typeId) {
    const usedByRooms = rooms.some((room) => room.typeId === typeId);
    if (usedByRooms) {
      setMessage("此房型已被房間使用，請先刪除或修改相關房間。");
      return;
    }

    try {
      await deleteDoc(doc(db, "roomTypes", typeId));
      await fetchRoomTypes();
      setMessage("房型已刪除。");
    } catch (error) {
      console.error("刪除房型失敗：", error);
      setMessage("刪除房型失敗。");
    }
  }

  async function handleRoomSubmit(e) {
    e.preventDefault();

    if (
      !roomForm.typeId ||
      !roomForm.name.trim() ||
      !roomForm.price ||
      !roomForm.capacity
    ) {
      setMessage("請完整填寫房間資料。");
      return;
    }

    try {
      const payload = {
        typeId: roomForm.typeId,
        name: roomForm.name.trim(),
        description: roomForm.description.trim(),
        price: Number(roomForm.price),
        capacity: Number(roomForm.capacity),
        amenities: roomForm.amenities
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        status: roomForm.status,
      };

      if (editingRoomId) {
        await updateDoc(doc(db, "rooms", editingRoomId), payload);
        setMessage("房間已更新。");
      } else {
        await addDoc(collection(db, "rooms"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setMessage("房間已新增。");
      }

      setRoomForm(initialRoomForm);
      setEditingRoomId("");
      await fetchRooms();
    } catch (error) {
      console.error("房間儲存失敗：", error);
      setMessage("房間儲存失敗。");
    }
  }

  function handleEditRoom(room) {
    setEditingRoomId(room.id);
    setRoomForm({
      typeId: room.typeId || "",
      name: room.name || "",
      description: room.description || "",
      price: room.price || "",
      capacity: room.capacity || "",
      amenities: Array.isArray(room.amenities) ? room.amenities.join(", ") : "",
      status: room.status || ROOM_STATUS.AVAILABLE,
    });
  }

  async function handleDeleteRoom(roomId) {
    const hasBookings = bookings.some((booking) => booking.roomId === roomId);
    if (hasBookings) {
      setMessage("此房間已有訂單紀錄，若要停用請改成房間狀態：停用。");
      return;
    }

    try {
      await deleteDoc(doc(db, "rooms", roomId));
      await fetchRooms();
      setMessage("房間已刪除。");
    } catch (error) {
      console.error("刪除房間失敗：", error);
      setMessage("刪除房間失敗。");
    }
  }

  async function handleUpdateBookingStatus(bookingId, nextStatus) {
    try {
      await updateDoc(doc(db, "bookings", bookingId), {
        status: nextStatus,
      });
      await fetchBookings();
      setMessage("訂單狀態已更新。");
    } catch (error) {
      console.error("更新訂單狀態失敗：", error);
      setMessage("更新訂單狀態失敗。");
    }
  }

  async function handleUpdateRoomStatus(roomId, nextStatus) {
    try {
      await updateDoc(doc(db, "rooms", roomId), {
        status: nextStatus,
      });
      await fetchRooms();
      setMessage("房間狀態已更新。");
    } catch (error) {
      console.error("更新房間狀態失敗：", error);
      setMessage("更新房間狀態失敗。");
    }
  }

  function handleResetSearch() {
    setSearchTypeId("");
    setSearchCheckIn("");
    setSearchCheckOut("");
  }

  async function seedDemoData() {
    if (roomTypes.length > 0 || rooms.length > 0) {
      setMessage("已有資料，略過範例建立。");
      return;
    }

    try {
      const typeA = await addDoc(collection(db, "roomTypes"), {
        name: "雙人房",
        description: "適合情侶或雙人旅客入住。",
        createdAt: serverTimestamp(),
      });

      const typeB = await addDoc(collection(db, "roomTypes"), {
        name: "家庭房",
        description: "適合家庭或多人旅遊入住。",
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "rooms"), {
        typeId: typeA.id,
        name: "晨光雙人房 201",
        description: "採光明亮，附陽台與簡約設計。",
        price: 2800,
        capacity: 2,
        amenities: ["Wi-Fi", "冷氣", "電視", "獨立衛浴"],
        status: ROOM_STATUS.AVAILABLE,
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "rooms"), {
        typeId: typeA.id,
        name: "木質雙人房 202",
        description: "溫暖木質風格，適合放鬆度假。",
        price: 3200,
        capacity: 2,
        amenities: ["Wi-Fi", "浴缸", "吹風機", "早餐"],
        status: ROOM_STATUS.AVAILABLE,
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "rooms"), {
        typeId: typeB.id,
        name: "家庭景觀房 301",
        description: "寬敞空間，可入住 4 人。",
        price: 4800,
        capacity: 4,
        amenities: ["Wi-Fi", "冰箱", "浴缸", "景觀窗"],
        status: ROOM_STATUS.AVAILABLE,
        createdAt: serverTimestamp(),
      });

      await fetchAllData();
      setMessage("範例資料已建立。");
    } catch (error) {
      console.error("建立範例資料失敗：", error);
      setMessage("建立範例資料失敗。");
    }
  }

  if (loading || !authReady) {
    return (
      <>
        <style>{globalStyles}</style>
        <div className="fullscreen-loading">
          <div className="loading-card">
            <div className="spinner" />
            <h2>系統載入中...</h2>
            <p>正在初始化 Firebase 與訂房資料</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{globalStyles}</style>
      <div className="app-shell">
        <header className="topbar">
          <div>
            <h1 className="brand-title">民宿訂房系統</h1>
            <p className="brand-subtitle">
              React + Firebase Firestore + 匿名登入
            </p>
          </div>

          <div className="topbar-actions">
            <div className="user-chip">
              <span>目前身份：</span>
              <strong>{roleView === "customer" ? "顧客端" : "管理者端"}</strong>
            </div>
            <div className="user-chip">
              <span>UID：</span>
              <strong className="uid-text">
                {currentUser?.uid ? currentUser.uid.slice(0, 10) + "..." : "-"}
              </strong>
            </div>
            <div className="toggle-group">
              <button
                className={`tab-btn ${roleView === "customer" ? "active" : ""}`}
                onClick={() => setRoleView("customer")}
              >
                顧客端
              </button>
              <button
                className={`tab-btn ${roleView === "admin" ? "active" : ""}`}
                onClick={() => setRoleView("admin")}
              >
                管理者端
              </button>
            </div>
          </div>
        </header>

        {message && <div className="message-banner">{message}</div>}

        {roleView === "customer" ? (
          <main className="main-grid">
            <section className="panel">
              <div className="panel-header">
                <h2>搜尋空房</h2>
                <button className="secondary-btn" onClick={handleResetSearch}>
                  清除搜尋
                </button>
              </div>

              <div className="form-grid">
                <div className="form-item">
                  <label>房型</label>
                  <select
                    value={searchTypeId}
                    onChange={(e) => setSearchTypeId(e.target.value)}
                  >
                    <option value="">全部房型</option>
                    {roomTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-item">
                  <label>入住日期</label>
                  <input
                    type="date"
                    value={searchCheckIn}
                    onChange={(e) => setSearchCheckIn(e.target.value)}
                  />
                </div>

                <div className="form-item">
                  <label>退房日期</label>
                  <input
                    type="date"
                    value={searchCheckOut}
                    onChange={(e) => setSearchCheckOut(e.target.value)}
                  />
                </div>
              </div>

              <div className="hint-text">
                可依入住日期、退房日期與房型搜尋可預訂房間。
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>房型與房間列表</h2>
                <span className="counter-badge">共 {filteredRooms.length} 間</span>
              </div>

              <div className="card-grid">
                {filteredRooms.length === 0 ? (
                  <div className="empty-state">
                    <p>目前沒有符合條件的空房。</p>
                  </div>
                ) : (
                  filteredRooms.map((room) => (
                    <div className="room-card" key={room.id}>
                      <div className="card-top">
                        <div>
                          <div className="type-badge">{getRoomTypeName(room.typeId)}</div>
                          <h3>{room.name}</h3>
                        </div>
                        <span
                          className={`status-pill ${
                            room.status === ROOM_STATUS.AVAILABLE
                              ? "status-available"
                              : room.status === ROOM_STATUS.BOOKED
                              ? "status-booked"
                              : "status-disabled"
                          }`}
                        >
                          {room.status}
                        </span>
                      </div>

                      <div className="room-meta-list">
                        <div>價格：NT$ {room.price}</div>
                        <div>可入住人數：{room.capacity} 人</div>
                      </div>

                      <p className="room-desc">
                        {room.description || "尚未填寫房間描述"}
                      </p>

                      <button
                        className="primary-btn"
                        onClick={() => handleSelectRoom(room)}
                      >
                        查看詳情 / 我要預訂
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>房間詳細資訊</h2>
              </div>

              {!selectedRoom ? (
                <div className="empty-state">
                  <p>請先從房間列表選擇一間房。</p>
                </div>
              ) : (
                <div className="detail-layout">
                  <div className="detail-card">
                    <h3>{selectedRoom.name}</h3>
                    <div className="detail-row">
                      <span>房型名稱</span>
                      <strong>{getRoomTypeName(selectedRoom.typeId)}</strong>
                    </div>
                    <div className="detail-row">
                      <span>房間名稱</span>
                      <strong>{selectedRoom.name}</strong>
                    </div>
                    <div className="detail-row">
                      <span>房型描述</span>
                      <strong>{getRoomTypeDescription(selectedRoom.typeId) || "-"}</strong>
                    </div>
                    <div className="detail-row">
                      <span>房間描述</span>
                      <strong>{selectedRoom.description || "-"}</strong>
                    </div>
                    <div className="detail-row">
                      <span>價格</span>
                      <strong>NT$ {selectedRoom.price}</strong>
                    </div>
                    <div className="detail-row">
                      <span>可入住人數</span>
                      <strong>{selectedRoom.capacity} 人</strong>
                    </div>
                    <div className="detail-row">
                      <span>設施</span>
                      <strong>
                        {Array.isArray(selectedRoom.amenities) && selectedRoom.amenities.length > 0
                          ? selectedRoom.amenities.join("、")
                          : "-"}
                      </strong>
                    </div>
                    <div className="detail-row">
                      <span>房間狀態</span>
                      <strong>{selectedRoom.status}</strong>
                    </div>
                  </div>

                  <form className="detail-card" onSubmit={handleCreateBooking}>
                    <h3>提交訂房申請</h3>

                    <div className="form-grid">
                      <div className="form-item">
                        <label>姓名</label>
                        <input
                          type="text"
                          value={bookingForm.customerName}
                          onChange={(e) =>
                            setBookingForm((prev) => ({
                              ...prev,
                              customerName: e.target.value,
                            }))
                          }
                          placeholder="請輸入姓名"
                        />
                      </div>

                      <div className="form-item">
                        <label>電話</label>
                        <input
                          type="text"
                          value={bookingForm.phone}
                          onChange={(e) =>
                            setBookingForm((prev) => ({
                              ...prev,
                              phone: e.target.value,
                            }))
                          }
                          placeholder="請輸入電話"
                        />
                      </div>

                      <div className="form-item">
                        <label>入住日期</label>
                        <input
                          type="date"
                          value={toDateValue(bookingForm.checkInDate)}
                          onChange={(e) =>
                            setBookingForm((prev) => ({
                              ...prev,
                              checkInDate: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="form-item">
                        <label>退房日期</label>
                        <input
                          type="date"
                          value={toDateValue(bookingForm.checkOutDate)}
                          onChange={(e) =>
                            setBookingForm((prev) => ({
                              ...prev,
                              checkOutDate: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="form-item">
                        <label>入住人數</label>
                        <input
                          type="number"
                          min="1"
                          max={selectedRoom.capacity || 1}
                          value={bookingForm.guests}
                          onChange={(e) =>
                            setBookingForm((prev) => ({
                              ...prev,
                              guests: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="form-item form-item-full">
                        <label>備註</label>
                        <textarea
                          rows="4"
                          value={bookingForm.note}
                          onChange={(e) =>
                            setBookingForm((prev) => ({
                              ...prev,
                              note: e.target.value,
                            }))
                          }
                          placeholder="例如：是否需要加床、預計到店時間..."
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="primary-btn"
                      disabled={submittingBooking}
                    >
                      {submittingBooking ? "送出中..." : "送出訂房申請"}
                    </button>
                  </form>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>我的訂單</h2>
                <div className="inline-actions">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={myOrdersOnly}
                      onChange={(e) => setMyOrdersOnly(e.target.checked)}
                    />
                    只看我的訂單
                  </label>
                </div>
              </div>

              <div className="card-grid">
                {customerOrders.length === 0 ? (
                  <div className="empty-state">
                    <p>目前沒有可顯示的訂單。</p>
                  </div>
                ) : (
                  customerOrders.map((booking) => (
                    <div className="order-card" key={booking.id}>
                      <div className="card-top">
                        <div>
                          <div className="type-badge">
                            {booking.roomTypeName || roomIdToTypeNameMap[booking.roomId] || "房型"}
                          </div>
                          <h3>{booking.roomName}</h3>
                        </div>
                        <span
                          className={`status-pill ${
                            booking.status === BOOKING_STATUS.CANCELED
                              ? "status-disabled"
                              : booking.status === BOOKING_STATUS.CHECKED_IN
                              ? "status-booked"
                              : "status-available"
                          }`}
                        >
                          {booking.status}
                        </span>
                      </div>

                      <div className="detail-row">
                        <span>姓名</span>
                        <strong>{booking.customerName}</strong>
                      </div>
                      <div className="detail-row">
                        <span>電話</span>
                        <strong>{booking.phone}</strong>
                      </div>
                      <div className="detail-row">
                        <span>入住日期</span>
                        <strong>{formatDate(booking.checkInDate)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>退房日期</span>
                        <strong>{formatDate(booking.checkOutDate)}</strong>
                      </div>
                      <div className="detail-row">
                        <span>入住人數</span>
                        <strong>{booking.guests} 人</strong>
                      </div>
                      <div className="detail-row">
                        <span>價格</span>
                        <strong>NT$ {booking.price}</strong>
                      </div>
                      <div className="detail-row">
                        <span>備註</span>
                        <strong>{booking.note || "-"}</strong>
                      </div>

                      {canCancelBooking(booking) && booking.userId === currentUser?.uid && (
                        <button
                          className="danger-btn"
                          onClick={() => handleCancelBooking(booking.id)}
                        >
                          取消訂單
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </main>
        ) : (
          <main className="main-grid">
            <section className="panel">
              <div className="panel-header">
                <h2>管理功能</h2>
                <button className="secondary-btn" onClick={seedDemoData}>
                  建立範例資料
                </button>
              </div>
              <div className="hint-text">
                可管理房型、房間、訂單與房間狀態。
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>{editingRoomTypeId ? "編輯房型" : "新增房型"}</h2>
              </div>
              <form onSubmit={handleRoomTypeSubmit}>
                <div className="form-grid">
                  <div className="form-item">
                    <label>房型名稱</label>
                    <input
                      type="text"
                      value={roomTypeForm.name}
                      onChange={(e) =>
                        setRoomTypeForm((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder="例如：雙人房、家庭房"
                    />
                  </div>
                  <div className="form-item form-item-full">
                    <label>房型描述</label>
                    <textarea
                      rows="3"
                      value={roomTypeForm.description}
                      onChange={(e) =>
                        setRoomTypeForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      placeholder="請輸入房型說明"
                    />
                  </div>
                </div>

                <div className="inline-actions">
                  <button type="submit" className="primary-btn">
                    {editingRoomTypeId ? "更新房型" : "新增房型"}
                  </button>
                  {editingRoomTypeId && (
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        setEditingRoomTypeId("");
                        setRoomTypeForm(initialRoomTypeForm);
                      }}
                    >
                      取消編輯
                    </button>
                  )}
                </div>
              </form>

              <div className="simple-list">
                {roomTypes.map((type) => (
                  <div key={type.id} className="simple-list-item">
                    <div>
                      <strong>{type.name}</strong>
                      <p>{type.description || "無描述"}</p>
                    </div>
                    <div className="inline-actions">
                      <button className="secondary-btn" onClick={() => handleEditRoomType(type)}>
                        編輯
                      </button>
                      <button className="danger-btn" onClick={() => handleDeleteRoomType(type.id)}>
                        刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>{editingRoomId ? "編輯房間" : "新增房間"}</h2>
              </div>
              <form onSubmit={handleRoomSubmit}>
                <div className="form-grid">
                  <div className="form-item">
                    <label>房型</label>
                    <select
                      value={roomForm.typeId}
                      onChange={(e) =>
                        setRoomForm((prev) => ({
                          ...prev,
                          typeId: e.target.value,
                        }))
                      }
                    >
                      <option value="">請選擇房型</option>
                      {roomTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-item">
                    <label>房間名稱</label>
                    <input
                      type="text"
                      value={roomForm.name}
                      onChange={(e) =>
                        setRoomForm((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder="例如：晨光雙人房 201"
                    />
                  </div>

                  <div className="form-item">
                    <label>價格</label>
                    <input
                      type="number"
                      min="0"
                      value={roomForm.price}
                      onChange={(e) =>
                        setRoomForm((prev) => ({
                          ...prev,
                          price: e.target.value,
                        }))
                      }
                      placeholder="請輸入價格"
                    />
                  </div>

                  <div className="form-item">
                    <label>可入住人數</label>
                    <input
                      type="number"
                      min="1"
                      value={roomForm.capacity}
                      onChange={(e) =>
                        setRoomForm((prev) => ({
                          ...prev,
                          capacity: e.target.value,
                        }))
                      }
                      placeholder="請輸入可住人數"
                    />
                  </div>

                  <div className="form-item">
                    <label>房間狀態</label>
                    <select
                      value={roomForm.status}
                      onChange={(e) =>
                        setRoomForm((prev) => ({
                          ...prev,
                          status: e.target.value,
                        }))
                      }
                    >
                      {Object.values(ROOM_STATUS).map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-item form-item-full">
                    <label>房間描述</label>
                    <textarea
                      rows="3"
                      value={roomForm.description}
                      onChange={(e) =>
                        setRoomForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      placeholder="請輸入房間描述"
                    />
                  </div>

                  <div className="form-item form-item-full">
                    <label>設施（請用逗號分隔）</label>
                    <input
                      type="text"
                      value={roomForm.amenities}
                      onChange={(e) =>
                        setRoomForm((prev) => ({
                          ...prev,
                          amenities: e.target.value,
                        }))
                      }
                      placeholder="例如：Wi-Fi, 冷氣, 電視, 早餐"
                    />
                  </div>
                </div>

                <div className="inline-actions">
                  <button type="submit" className="primary-btn">
                    {editingRoomId ? "更新房間" : "新增房間"}
                  </button>
                  {editingRoomId && (
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        setEditingRoomId("");
                        setRoomForm(initialRoomForm);
                      }}
                    >
                      取消編輯
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>房間管理</h2>
                <span className="counter-badge">共 {rooms.length} 間</span>
              </div>

              <div className="card-grid">
                {rooms.length === 0 ? (
                  <div className="empty-state">
                    <p>尚未建立房間資料。</p>
                  </div>
                ) : (
                  rooms.map((room) => (
                    <div className="room-card" key={room.id}>
                      <div className="card-top">
                        <div>
                          <div className="type-badge">{getRoomTypeName(room.typeId)}</div>
                          <h3>{room.name}</h3>
                        </div>
                        <span
                          className={`status-pill ${
                            room.status === ROOM_STATUS.AVAILABLE
                              ? "status-available"
                              : room.status === ROOM_STATUS.BOOKED
                              ? "status-booked"
                              : "status-disabled"
                          }`}
                        >
                          {room.status}
                        </span>
                      </div>

                      <div className="room-meta-list">
                        <div>價格：NT$ {room.price}</div>
                        <div>人數：{room.capacity} 人</div>
                      </div>

                      <p className="room-desc">{room.description || "尚未填寫描述"}</p>

                      <div className="select-block">
                        <label>修改房間狀態</label>
                        <select
                          value={room.status}
                          onChange={(e) => handleUpdateRoomStatus(room.id, e.target.value)}
                        >
                          {Object.values(ROOM_STATUS).map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="inline-actions">
                        <button className="secondary-btn" onClick={() => handleEditRoom(room)}>
                          編輯
                        </button>
                        <button className="danger-btn" onClick={() => handleDeleteRoom(room.id)}>
                          刪除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>所有訂單</h2>
                <span className="counter-badge">共 {bookings.length} 筆</span>
              </div>

              <div className="card-grid">
                {bookings.length === 0 ? (
                  <div className="empty-state">
                    <p>目前沒有訂單資料。</p>
                  </div>
                ) : (
                  [...bookings]
                    .sort((a, b) => {
                      const aTime = new Date(a.checkInDate || 0).getTime();
                      const bTime = new Date(b.checkInDate || 0).getTime();
                      return aTime - bTime;
                    })
                    .map((booking) => (
                      <div className="order-card" key={booking.id}>
                        <div className="card-top">
                          <div>
                            <div className="type-badge">
                              {booking.roomTypeName || "房型"}
                            </div>
                            <h3>{booking.roomName}</h3>
                          </div>
                          <span
                            className={`status-pill ${
                              booking.status === BOOKING_STATUS.CANCELED
                                ? "status-disabled"
                                : booking.status === BOOKING_STATUS.CHECKED_IN
                                ? "status-booked"
                                : "status-available"
                            }`}
                          >
                            {booking.status}
                          </span>
                        </div>

                        <div className="detail-row">
                          <span>顧客姓名</span>
                          <strong>{booking.customerName}</strong>
                        </div>
                        <div className="detail-row">
                          <span>電話</span>
                          <strong>{booking.phone}</strong>
                        </div>
                        <div className="detail-row">
                          <span>入住日期</span>
                          <strong>{booking.checkInDate}</strong>
                        </div>
                        <div className="detail-row">
                          <span>退房日期</span>
                          <strong>{booking.checkOutDate}</strong>
                        </div>
                        <div className="detail-row">
                          <span>入住人數</span>
                          <strong>{booking.guests} 人</strong>
                        </div>
                        <div className="detail-row">
                          <span>使用者 UID</span>
                          <strong>{booking.userId}</strong>
                        </div>

                        <div className="select-block">
                          <label>修改訂單狀態</label>
                          <select
                            value={booking.status}
                            onChange={(e) =>
                              handleUpdateBookingStatus(booking.id, e.target.value)
                            }
                          >
                            {Object.values(BOOKING_STATUS).map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </section>
          </main>
        )}
      </div>
    </>
  );
}

const globalStyles = `
  * {
    box-sizing: border-box;
  }

  html, body, #root {
    margin: 0;
    padding: 0;
    min-height: 100%;
    font-family: "Segoe UI", "Noto Sans TC", Arial, sans-serif;
    background: #f4f7fb;
    color: #1f2937;
  }

  body {
    min-height: 100vh;
  }

  button, input, select, textarea {
    font: inherit;
  }

  .app-shell {
    min-height: 100vh;
    padding: 24px;
    background:
      radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 30%),
      radial-gradient(circle at top right, rgba(16, 185, 129, 0.08), transparent 25%),
      #f4f7fb;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 20px;
    padding: 20px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(8px);
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  }

  .brand-title {
    margin: 0;
    font-size: 32px;
    font-weight: 800;
    letter-spacing: 0.5px;
  }

  .brand-subtitle {
    margin: 8px 0 0;
    color: #6b7280;
    font-size: 14px;
  }

  .topbar-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 12px;
    align-items: center;
  }

  .user-chip {
    background: #eef2ff;
    color: #3730a3;
    border-radius: 999px;
    padding: 10px 14px;
    font-size: 13px;
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .uid-text {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toggle-group {
    display: flex;
    gap: 8px;
    background: #e5e7eb;
    padding: 6px;
    border-radius: 999px;
  }

  .tab-btn {
    border: none;
    border-radius: 999px;
    background: transparent;
    color: #374151;
    padding: 10px 16px;
    cursor: pointer;
    transition: 0.2s ease;
    font-weight: 600;
  }

  .tab-btn.active {
    background: #111827;
    color: white;
  }

  .message-banner {
    margin-bottom: 16px;
    background: #ecfeff;
    color: #155e75;
    border: 1px solid #a5f3fc;
    padding: 14px 16px;
    border-radius: 16px;
    box-shadow: 0 8px 24px rgba(8, 145, 178, 0.08);
  }

  .main-grid {
    display: grid;
    gap: 20px;
  }

  .panel {
    background: rgba(255, 255, 255, 0.9);
    border-radius: 24px;
    padding: 20px;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
    border: 1px solid rgba(226, 232, 240, 0.9);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 22px;
  }

  .counter-badge {
    background: #f3f4f6;
    padding: 8px 12px;
    border-radius: 999px;
    color: #374151;
    font-size: 13px;
    font-weight: 600;
  }

  .hint-text {
    color: #6b7280;
    font-size: 14px;
    line-height: 1.7;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .form-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-item-full {
    grid-column: 1 / -1;
  }

  .form-item label {
    font-size: 14px;
    font-weight: 700;
    color: #374151;
  }

  .form-item input,
  .form-item select,
  .form-item textarea,
  .select-block select {
    width: 100%;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 14px;
    padding: 12px 14px;
    outline: none;
    transition: 0.2s ease;
  }

  .form-item input:focus,
  .form-item select:focus,
  .form-item textarea:focus,
  .select-block select:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
  }

  .primary-btn,
  .secondary-btn,
  .danger-btn {
    border: none;
    border-radius: 14px;
    padding: 12px 16px;
    cursor: pointer;
    font-weight: 700;
    transition: transform 0.16s ease, opacity 0.16s ease;
  }

  .primary-btn:hover,
  .secondary-btn:hover,
  .danger-btn:hover {
    transform: translateY(-1px);
  }

  .primary-btn {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: white;
  }

  .secondary-btn {
    background: #eef2f7;
    color: #1f2937;
  }

  .danger-btn {
    background: #ef4444;
    color: white;
  }

  .inline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #374151;
    font-size: 14px;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  .room-card,
  .order-card,
  .detail-card,
  .simple-list-item {
    background: white;
    border-radius: 20px;
    padding: 18px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 14px;
  }

  .card-top h3 {
    margin: 8px 0 0;
    font-size: 20px;
  }

  .type-badge {
    display: inline-block;
    background: #eff6ff;
    color: #1d4ed8;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 700;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }

  .status-available {
    background: #dcfce7;
    color: #166534;
  }

  .status-booked {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .status-disabled {
    background: #fee2e2;
    color: #b91c1c;
  }

  .room-meta-list {
    display: grid;
    gap: 8px;
    margin-bottom: 12px;
    color: #374151;
    font-size: 14px;
  }

  .room-desc {
    color: #6b7280;
    min-height: 48px;
    line-height: 1.7;
  }

  .detail-layout {
    display: grid;
    grid-template-columns: 1fr 1.1fr;
    gap: 18px;
  }

  .detail-card h3 {
    margin-top: 0;
    margin-bottom: 16px;
    font-size: 22px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    padding: 10px 0;
    border-bottom: 1px dashed #e5e7eb;
  }

  .detail-row span {
    color: #6b7280;
    min-width: 90px;
  }

  .detail-row strong {
    text-align: right;
    word-break: break-word;
  }

  .empty-state {
    border: 1px dashed #cbd5e1;
    border-radius: 18px;
    padding: 28px;
    text-align: center;
    color: #6b7280;
    background: #f8fafc;
  }

  .simple-list {
    display: grid;
    gap: 12px;
    margin-top: 16px;
  }

  .simple-list-item {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .simple-list-item p {
    margin: 6px 0 0;
    color: #6b7280;
  }

  .select-block {
    display: grid;
    gap: 8px;
    margin: 14px 0;
  }

  .select-block label {
    font-size: 14px;
    font-weight: 700;
    color: #374151;
  }

  .fullscreen-loading {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 30%),
      radial-gradient(circle at top right, rgba(16, 185, 129, 0.08), transparent 25%),
      #f4f7fb;
  }

  .loading-card {
    width: min(420px, 100%);
    background: rgba(255, 255, 255, 0.92);
    border-radius: 28px;
    padding: 36px 24px;
    text-align: center;
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  }

  .loading-card h2 {
    margin: 12px 0 8px;
    font-size: 28px;
  }

  .loading-card p {
    margin: 0;
    color: #6b7280;
  }

  .spinner {
    width: 52px;
    height: 52px;
    margin: 0 auto 8px;
    border-radius: 999px;
    border: 5px solid #dbeafe;
    border-top-color: #2563eb;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 1080px) {
    .card-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .detail-layout {
      grid-template-columns: 1fr;
    }

    .form-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 768px) {
    .app-shell {
      padding: 14px;
    }

    .topbar {
      flex-direction: column;
      align-items: stretch;
    }

    .topbar-actions {
      justify-content: flex-start;
    }

    .card-grid,
    .form-grid {
      grid-template-columns: 1fr;
    }

    .simple-list-item {
      flex-direction: column;
      align-items: stretch;
    }

    .detail-row {
      flex-direction: column;
    }

    .detail-row strong {
      text-align: left;
    }

    .brand-title {
      font-size: 26px;
    }
  }
`;
