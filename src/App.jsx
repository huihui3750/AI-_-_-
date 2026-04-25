import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";

/* ================= Firebase 設定 ================= */
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

/* ================= 常數 ================= */
const ROOM_STATUS = ["可訂房", "已被預訂", "停用"];
const ORDER_STATUS = ["待確認", "已確認", "已取消", "已入住"];
const ACTIVE_ORDER_STATUS = ["待確認", "已確認", "已入住"];

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(localStorage.getItem("role") || "");
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [orders, setOrders] = useState([]);

  const [page, setPage] = useState("rooms");
  const [message, setMessage] = useState(null);

  const [filters, setFilters] = useState({
    checkInDate: "",
    checkOutDate: "",
    roomTypeId: "",
    maxPrice: "",
  });

  const [selectedRoom, setSelectedRoom] = useState(null);

  const [bookingForm, setBookingForm] = useState({
    customerName: "",
    phone: "",
    checkInDate: "",
    checkOutDate: "",
    guests: 1,
    note: "",
  });

  const [roomTypeForm, setRoomTypeForm] = useState({
    id: "",
    name: "",
    description: "",
  });

  const [roomForm, setRoomForm] = useState({
    id: "",
    roomTypeId: "",
    roomName: "",
    description: "",
    price: "",
    capacity: "",
    facilities: "",
    status: "可訂房",
  });

  const [phoneSearch, setPhoneSearch] = useState("");

  const isLoading = !authReady || (role && !dataReady);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!role) {
      setDataReady(true);
      return;
    }

    setDataReady(false);

    const unsubTypes = onSnapshot(
      query(collection(db, "roomTypes"), orderBy("createdAt", "desc")),
      (snapshot) => {
        setRoomTypes(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setDataReady(true);
      },
      () => {
        showMessage("讀取房型失敗，請確認 Firestore Rules。", "error");
        setDataReady(true);
      }
    );

    const unsubRooms = onSnapshot(
      query(collection(db, "rooms"), orderBy("createdAt", "desc")),
      (snapshot) => {
        setRooms(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    const unsubOrders = onSnapshot(
      query(collection(db, "orders"), orderBy("createdAt", "desc")),
      (snapshot) => {
        setOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    return () => {
      unsubTypes();
      unsubRooms();
      unsubOrders();
    };
  }, [role]);

  const showMessage = (text, type = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const loginAs = async (selectedRole) => {
    try {
      const result = await signInAnonymously(auth);
      localStorage.setItem("role", selectedRole);
      localStorage.setItem("uid", result.user.uid);
      localStorage.setItem("isLogin", "true");
      setRole(selectedRole);
      setPage(selectedRole === "admin" ? "adminRooms" : "rooms");
      showMessage("登入成功");
    } catch (error) {
      showMessage("登入失敗：" + error.message, "error");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem("role");
    localStorage.removeItem("uid");
    localStorage.removeItem("isLogin");
    setRole("");
    setUser(null);
    setPage("rooms");
    showMessage("已登出");
  };

  const getRoomTypeName = (roomTypeId) => {
    return roomTypes.find((t) => t.id === roomTypeId)?.name || "未分類房型";
  };

  const isDateOverlap = (newIn, newOut, oldIn, oldOut) => {
    return newIn < oldOut && newOut > oldIn;
  };

  const checkRoomAvailable = async (roomId, checkInDate, checkOutDate) => {
    const q = query(
      collection(db, "orders"),
      where("roomId", "==", roomId),
      where("status", "in", ACTIVE_ORDER_STATUS)
    );

    const snapshot = await getDocs(q);

    return !snapshot.docs.some((d) => {
      const order = d.data();
      return isDateOverlap(
        checkInDate,
        checkOutDate,
        order.checkInDate,
        order.checkOutDate
      );
    });
  };

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchType = filters.roomTypeId
        ? room.roomTypeId === filters.roomTypeId
        : true;

      const matchPrice = filters.maxPrice
        ? Number(room.price) <= Number(filters.maxPrice)
        : true;

      return matchType && matchPrice;
    });
  }, [rooms, filters]);

  const customerOrders = useMemo(() => {
    return orders.filter((order) => {
      const uidMatch = order.customerUid === user?.uid;
      const phoneMatch = phoneSearch && order.phone === phoneSearch;
      return uidMatch || phoneMatch;
    });
  }, [orders, user, phoneSearch]);

  const submitBooking = async () => {
    if (!selectedRoom) return;

    if (
      !bookingForm.customerName ||
      !bookingForm.phone ||
      !bookingForm.checkInDate ||
      !bookingForm.checkOutDate ||
      !bookingForm.guests
    ) {
      showMessage("請完整填寫訂房資料", "error");
      return;
    }

    if (bookingForm.checkInDate >= bookingForm.checkOutDate) {
      showMessage("退房日期必須晚於入住日期", "error");
      return;
    }

    if (selectedRoom.status !== "可訂房") {
      showMessage("此房間目前不可訂房", "error");
      return;
    }

    if (Number(bookingForm.guests) > Number(selectedRoom.capacity)) {
      showMessage("入住人數超過房間可入住人數", "error");
      return;
    }

    try {
      const available = await checkRoomAvailable(
        selectedRoom.id,
        bookingForm.checkInDate,
        bookingForm.checkOutDate
      );

      if (!available) {
        showMessage("此日期區間已有有效訂單，無法重複訂房", "error");
        return;
      }

      await addDoc(collection(db, "orders"), {
        roomId: selectedRoom.id,
        roomName: selectedRoom.roomName,
        roomTypeName: getRoomTypeName(selectedRoom.roomTypeId),
        customerUid: user.uid,
        customerName: bookingForm.customerName,
        phone: bookingForm.phone,
        checkInDate: bookingForm.checkInDate,
        checkOutDate: bookingForm.checkOutDate,
        guests: Number(bookingForm.guests),
        note: bookingForm.note,
        status: "待確認",
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "rooms", selectedRoom.id), {
        status: "已被預訂",
      });

      setSelectedRoom(null);
      setBookingForm({
        customerName: "",
        phone: "",
        checkInDate: "",
        checkOutDate: "",
        guests: 1,
        note: "",
      });

      showMessage("訂房申請已送出");
    } catch (error) {
      showMessage("訂房失敗：" + error.message, "error");
    }
  };

  const cancelOrder = async (order) => {
    const today = new Date().toISOString().slice(0, 10);

    if (order.status === "已入住") {
      showMessage("已入住訂單不可取消", "error");
      return;
    }

    if (order.checkInDate <= today) {
      showMessage("尚未入住的訂單才可取消", "error");
      return;
    }

    try {
      await updateDoc(doc(db, "orders", order.id), {
        status: "已取消",
      });

      await updateDoc(doc(db, "rooms", order.roomId), {
        status: "可訂房",
      });

      showMessage("訂單已取消");
    } catch (error) {
      showMessage("取消失敗：" + error.message, "error");
    }
  };

  const saveRoomType = async () => {
    if (!roomTypeForm.name) {
      showMessage("請輸入房型名稱", "error");
      return;
    }

    try {
      if (roomTypeForm.id) {
        await updateDoc(doc(db, "roomTypes", roomTypeForm.id), {
          name: roomTypeForm.name,
          description: roomTypeForm.description,
        });
        showMessage("房型已更新");
      } else {
        await addDoc(collection(db, "roomTypes"), {
          name: roomTypeForm.name,
          description: roomTypeForm.description,
          createdAt: serverTimestamp(),
        });
        showMessage("房型已新增");
      }

      setRoomTypeForm({ id: "", name: "", description: "" });
    } catch (error) {
      showMessage("儲存房型失敗：" + error.message, "error");
    }
  };

  const editRoomType = (type) => {
    setRoomTypeForm({
      id: type.id,
      name: type.name,
      description: type.description,
    });
  };

  const removeRoomType = async (id) => {
    if (!window.confirm("確定刪除此房型？")) return;

    try {
      await deleteDoc(doc(db, "roomTypes", id));
      showMessage("房型已刪除");
    } catch (error) {
      showMessage("刪除房型失敗：" + error.message, "error");
    }
  };

  const saveRoom = async () => {
    if (
      !roomForm.roomTypeId ||
      !roomForm.roomName ||
      !roomForm.price ||
      !roomForm.capacity
    ) {
      showMessage("請完整填寫房間資料", "error");
      return;
    }

    const payload = {
      roomTypeId: roomForm.roomTypeId,
      roomName: roomForm.roomName,
      description: roomForm.description,
      price: Number(roomForm.price),
      capacity: Number(roomForm.capacity),
      facilities: roomForm.facilities,
      status: roomForm.status,
    };

    try {
      if (roomForm.id) {
        await updateDoc(doc(db, "rooms", roomForm.id), payload);
        showMessage("房間已更新");
      } else {
        await addDoc(collection(db, "rooms"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        showMessage("房間已新增");
      }

      setRoomForm({
        id: "",
        roomTypeId: "",
        roomName: "",
        description: "",
        price: "",
        capacity: "",
        facilities: "",
        status: "可訂房",
      });
    } catch (error) {
      showMessage("儲存房間失敗：" + error.message, "error");
    }
  };

  const editRoom = (room) => {
    setRoomForm({
      id: room.id,
      roomTypeId: room.roomTypeId,
      roomName: room.roomName,
      description: room.description,
      price: room.price,
      capacity: room.capacity,
      facilities: room.facilities,
      status: room.status,
    });
  };

  const removeRoom = async (id) => {
    if (!window.confirm("確定刪除此房間？")) return;

    try {
      await deleteDoc(doc(db, "rooms", id));
      showMessage("房間已刪除");
    } catch (error) {
      showMessage("刪除房間失敗：" + error.message, "error");
    }
  };

  const updateOrderStatus = async (order, status) => {
    try {
      await updateDoc(doc(db, "orders", order.id), { status });

      if (status === "已取消") {
        await updateDoc(doc(db, "rooms", order.roomId), {
          status: "可訂房",
        });
      }

      showMessage("訂單狀態已更新");
    } catch (error) {
      showMessage("更新失敗：" + error.message, "error");
    }
  };

  const updateRoomStatus = async (roomId, status) => {
    try {
      await updateDoc(doc(db, "rooms", roomId), { status });
      showMessage("房間狀態已更新");
    } catch (error) {
      showMessage("更新失敗：" + error.message, "error");
    }
  };

  const initDemoData = async () => {
    try {
      const deluxeRef = await addDoc(collection(db, "roomTypes"), {
        name: "雙人套房",
        description: "適合情侶或兩人旅行，空間舒適。",
        createdAt: serverTimestamp(),
      });

      const familyRef = await addDoc(collection(db, "roomTypes"), {
        name: "家庭房",
        description: "適合家庭旅遊，提供較大空間與多人入住。",
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "rooms"), {
        roomTypeId: deluxeRef.id,
        roomName: "A101",
        description: "明亮雙人房，附獨立衛浴與窗景。",
        price: 2200,
        capacity: 2,
        facilities: "Wi-Fi、冷氣、電視、獨立衛浴",
        status: "可訂房",
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "rooms"), {
        roomTypeId: deluxeRef.id,
        roomName: "A102",
        description: "舒適雙人房，適合短期住宿。",
        price: 2000,
        capacity: 2,
        facilities: "Wi-Fi、冷氣、吹風機",
        status: "可訂房",
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "rooms"), {
        roomTypeId: familyRef.id,
        roomName: "B201",
        description: "寬敞家庭房，可入住四人。",
        price: 3600,
        capacity: 4,
        facilities: "Wi-Fi、冷氣、電視、冰箱、獨立衛浴",
        status: "可訂房",
        createdAt: serverTimestamp(),
      });

      showMessage("範例資料初始化完成");
    } catch (error) {
      showMessage("初始化失敗：" + error.message, "error");
    }
  };

  if (!role) {
    return (
      <>
        <Style />
        <div className="loginPage">
          <div className="loginCard">
            <h1>民宿訂房系統</h1>
            <p>請選擇登入身分</p>
            <button onClick={() => loginAs("customer")}>顧客登入</button>
            <button className="adminBtn" onClick={() => loginAs("admin")}>
              管理者登入
            </button>
          </div>
          {message && <Toast message={message} />}
        </div>
      </>
    );
  }

  return (
    <>
      <Style />

      {isLoading && <div className="loading">系統載入中...</div>}

      <header className="header">
        <div>
          <h2>民宿訂房系統</h2>
          <p>
            身分：{role === "admin" ? "管理者" : "顧客"}｜UID：
            {user?.uid || localStorage.getItem("uid")}
          </p>
        </div>
        <button onClick={handleLogout}>登出</button>
      </header>

      {message && <Toast message={message} />}

      {role === "customer" && (
        <main className="container">
          <nav className="tabs">
            <button onClick={() => setPage("rooms")}>房間列表</button>
            <button onClick={() => setPage("myOrders")}>我的訂單</button>
          </nav>

          {page === "rooms" && (
            <>
              <section className="panel">
                <h3>搜尋空房</h3>
                <div className="grid4">
                  <input
                    type="date"
                    value={filters.checkInDate}
                    onChange={(e) =>
                      setFilters({ ...filters, checkInDate: e.target.value })
                    }
                  />
                  <input
                    type="date"
                    value={filters.checkOutDate}
                    onChange={(e) =>
                      setFilters({ ...filters, checkOutDate: e.target.value })
                    }
                  />
                  <select
                    value={filters.roomTypeId}
                    onChange={(e) =>
                      setFilters({ ...filters, roomTypeId: e.target.value })
                    }
                  >
                    <option value="">全部房型</option>
                    {roomTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="最高價格"
                    value={filters.maxPrice}
                    onChange={(e) =>
                      setFilters({ ...filters, maxPrice: e.target.value })
                    }
                  />
                </div>
              </section>

              <section className="cards">
                {filteredRooms.map((room) => (
                  <div className="card" key={room.id}>
                    <span className={`badge ${room.status}`}>
                      {room.status}
                    </span>
                    <h3>{getRoomTypeName(room.roomTypeId)}</h3>
                    <p>房間：{room.roomName}</p>
                    <p>價格：NT$ {room.price}</p>
                    <p>可入住：{room.capacity} 人</p>
                    <button onClick={() => setSelectedRoom(room)}>
                      查看詳細 / 訂房
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}

          {page === "myOrders" && (
            <section className="panel">
              <h3>我的訂單</h3>
              <input
                placeholder="也可輸入電話輔助查詢"
                value={phoneSearch}
                onChange={(e) => setPhoneSearch(e.target.value)}
              />
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>房型</th>
                      <th>房間</th>
                      <th>入住</th>
                      <th>退房</th>
                      <th>狀態</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerOrders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.roomTypeName}</td>
                        <td>{order.roomName}</td>
                        <td>{order.checkInDate}</td>
                        <td>{order.checkOutDate}</td>
                        <td>{order.status}</td>
                        <td>
                          <button onClick={() => cancelOrder(order)}>
                            取消訂單
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      )}

      {role === "admin" && (
        <main className="container">
          <nav className="tabs">
            <button onClick={() => setPage("adminTypes")}>房型管理</button>
            <button onClick={() => setPage("adminRooms")}>房間管理</button>
            <button onClick={() => setPage("adminOrders")}>訂單管理</button>
            <button className="adminBtn" onClick={initDemoData}>
              初始化範例資料
            </button>
          </nav>

          {page === "adminTypes" && (
            <section className="panel">
              <h3>房型管理</h3>
              <div className="form">
                <input
                  placeholder="房型名稱"
                  value={roomTypeForm.name}
                  onChange={(e) =>
                    setRoomTypeForm({ ...roomTypeForm, name: e.target.value })
                  }
                />
                <textarea
                  placeholder="房型描述"
                  value={roomTypeForm.description}
                  onChange={(e) =>
                    setRoomTypeForm({
                      ...roomTypeForm,
                      description: e.target.value,
                    })
                  }
                />
                <button onClick={saveRoomType}>
                  {roomTypeForm.id ? "更新房型" : "新增房型"}
                </button>
              </div>

              <div className="cards">
                {roomTypes.map((type) => (
                  <div className="card" key={type.id}>
                    <h3>{type.name}</h3>
                    <p>{type.description}</p>
                    <button onClick={() => editRoomType(type)}>編輯</button>
                    <button
                      className="danger"
                      onClick={() => removeRoomType(type.id)}
                    >
                      刪除
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {page === "adminRooms" && (
            <section className="panel">
              <h3>房間管理</h3>
              <div className="form">
                <select
                  value={roomForm.roomTypeId}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, roomTypeId: e.target.value })
                  }
                >
                  <option value="">選擇房型</option>
                  {roomTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="房間名稱或編號"
                  value={roomForm.roomName}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, roomName: e.target.value })
                  }
                />
                <textarea
                  placeholder="房間描述"
                  value={roomForm.description}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, description: e.target.value })
                  }
                />
                <input
                  type="number"
                  placeholder="價格"
                  value={roomForm.price}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, price: e.target.value })
                  }
                />
                <input
                  type="number"
                  placeholder="可入住人數"
                  value={roomForm.capacity}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, capacity: e.target.value })
                  }
                />
                <input
                  placeholder="設施，例如 Wi-Fi、冷氣"
                  value={roomForm.facilities}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, facilities: e.target.value })
                  }
                />
                <select
                  value={roomForm.status}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, status: e.target.value })
                  }
                >
                  {ROOM_STATUS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <button onClick={saveRoom}>
                  {roomForm.id ? "更新房間" : "新增房間"}
                </button>
              </div>

              <div className="cards">
                {rooms.map((room) => (
                  <div className="card" key={room.id}>
                    <span className={`badge ${room.status}`}>
                      {room.status}
                    </span>
                    <h3>{room.roomName}</h3>
                    <p>房型：{getRoomTypeName(room.roomTypeId)}</p>
                    <p>價格：NT$ {room.price}</p>
                    <p>可入住：{room.capacity} 人</p>
                    <p>{room.description}</p>
                    <select
                      value={room.status}
                      onChange={(e) =>
                        updateRoomStatus(room.id, e.target.value)
                      }
                    >
                      {ROOM_STATUS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <button onClick={() => editRoom(room)}>編輯</button>
                    <button
                      className="danger"
                      onClick={() => removeRoom(room.id)}
                    >
                      刪除
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {page === "adminOrders" && (
            <section className="panel">
              <h3>所有訂單</h3>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>顧客</th>
                      <th>電話</th>
                      <th>房型</th>
                      <th>房間</th>
                      <th>入住</th>
                      <th>退房</th>
                      <th>人數</th>
                      <th>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.customerName}</td>
                        <td>{order.phone}</td>
                        <td>{order.roomTypeName}</td>
                        <td>{order.roomName}</td>
                        <td>{order.checkInDate}</td>
                        <td>{order.checkOutDate}</td>
                        <td>{order.guests}</td>
                        <td>
                          <select
                            value={order.status}
                            onChange={(e) =>
                              updateOrderStatus(order, e.target.value)
                            }
                          >
                            {ORDER_STATUS.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      )}

      {selectedRoom && (
        <div className="modal">
          <div className="modalCard">
            <button className="close" onClick={() => setSelectedRoom(null)}>
              ✕
            </button>

            <h2>{getRoomTypeName(selectedRoom.roomTypeId)}</h2>
            <p>房間：{selectedRoom.roomName}</p>
            <p>描述：{selectedRoom.description}</p>
            <p>價格：NT$ {selectedRoom.price}</p>
            <p>可入住人數：{selectedRoom.capacity}</p>
            <p>設施：{selectedRoom.facilities}</p>
            <p>狀態：{selectedRoom.status}</p>

            <h3>訂房申請</h3>
            <div className="form">
              <input
                placeholder="訂房人姓名"
                value={bookingForm.customerName}
                onChange={(e) =>
                  setBookingForm({
                    ...bookingForm,
                    customerName: e.target.value,
                  })
                }
              />
              <input
                placeholder="電話"
                value={bookingForm.phone}
                onChange={(e) =>
                  setBookingForm({ ...bookingForm, phone: e.target.value })
                }
              />
              <input
                type="date"
                value={bookingForm.checkInDate}
                onChange={(e) =>
                  setBookingForm({
                    ...bookingForm,
                    checkInDate: e.target.value,
                  })
                }
              />
              <input
                type="date"
                value={bookingForm.checkOutDate}
                onChange={(e) =>
                  setBookingForm({
                    ...bookingForm,
                    checkOutDate: e.target.value,
                  })
                }
              />
              <input
                type="number"
                min="1"
                placeholder="入住人數"
                value={bookingForm.guests}
                onChange={(e) =>
                  setBookingForm({ ...bookingForm, guests: e.target.value })
                }
              />
              <textarea
                placeholder="備註"
                value={bookingForm.note}
                onChange={(e) =>
                  setBookingForm({ ...bookingForm, note: e.target.value })
                }
              />
              <button onClick={submitBooking}>送出訂房</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Toast({ message }) {
  return <div className={`toast ${message.type}`}>{message.text}</div>;
}

function Style() {
  return (
    <style>{`
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: Arial, "Noto Sans TC", sans-serif;
        background: #f4f7fb;
        color: #1f2937;
      }

      button {
        border: none;
        border-radius: 12px;
        padding: 10px 16px;
        background: #2563eb;
        color: white;
        cursor: pointer;
        font-weight: 600;
        margin: 4px;
      }

      button:hover {
        opacity: 0.9;
      }

      input,
      select,
      textarea {
        width: 100%;
        padding: 12px;
        border: 1px solid #d1d5db;
        border-radius: 12px;
        font-size: 14px;
        background: white;
      }

      textarea {
        min-height: 80px;
        resize: vertical;
      }

      .loginPage {
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        background: linear-gradient(135deg, #dbeafe, #f8fafc);
        padding: 20px;
      }

      .loginCard {
        width: 100%;
        max-width: 420px;
        background: white;
        border-radius: 24px;
        padding: 36px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.12);
        text-align: center;
      }

      .loginCard h1 {
        margin-bottom: 10px;
      }

      .adminBtn {
        background: #0f766e;
      }

      .danger {
        background: #dc2626;
      }

      .header {
        background: white;
        padding: 18px 28px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.06);
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .header h2 {
        margin: 0;
      }

      .header p {
        margin: 6px 0 0;
        font-size: 13px;
        color: #6b7280;
        word-break: break-all;
      }

      .container {
        max-width: 1200px;
        margin: 24px auto;
        padding: 0 18px;
      }

      .tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 20px;
      }

      .panel {
        background: white;
        border-radius: 22px;
        padding: 22px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.06);
        margin-bottom: 22px;
      }

      .grid4 {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
      }

      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 18px;
      }

      .card {
        background: white;
        border-radius: 22px;
        padding: 20px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.06);
        position: relative;
      }

      .card h3 {
        margin-top: 8px;
      }

      .card p {
        color: #4b5563;
        line-height: 1.5;
      }

      .badge {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        color: white;
        background: #2563eb;
      }

      .badge.可訂房 {
        background: #16a34a;
      }

      .badge.已被預訂 {
        background: #f59e0b;
      }

      .badge.停用 {
        background: #6b7280;
      }

      .form {
        display: grid;
        gap: 12px;
        margin-bottom: 20px;
      }

      .tableWrap {
        overflow-x: auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        min-width: 800px;
      }

      th,
      td {
        padding: 12px;
        border-bottom: 1px solid #e5e7eb;
        text-align: left;
        vertical-align: middle;
      }

      th {
        background: #f9fafb;
      }

      .modal {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.45);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 30;
        padding: 18px;
      }

      .modalCard {
        width: 100%;
        max-width: 620px;
        max-height: 90vh;
        overflow-y: auto;
        background: white;
        border-radius: 24px;
        padding: 26px;
        position: relative;
      }

      .close {
        position: absolute;
        top: 14px;
        right: 14px;
        background: #111827;
      }

      .toast {
        position: fixed;
        top: 88px;
        right: 20px;
        padding: 14px 18px;
        border-radius: 14px;
        color: white;
        z-index: 50;
        background: #16a34a;
        box-shadow: 0 10px 30px rgba(0,0,0,0.18);
      }

      .toast.error {
        background: #dc2626;
      }

      .loading {
        position: fixed;
        inset: 0;
        z-index: 100;
        background: rgba(255,255,255,0.92);
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 22px;
        font-weight: bold;
        color: #2563eb;
      }

      @media (max-width: 900px) {
        .grid4 {
          grid-template-columns: repeat(2, 1fr);
        }

        .header {
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
        }
      }

      @media (max-width: 600px) {
        .grid4 {
          grid-template-columns: 1fr;
        }

        .loginCard {
          padding: 24px;
        }

        .panel {
          padding: 16px;
        }

        .card {
          padding: 16px;
        }

        .toast {
          left: 16px;
          right: 16px;
          top: 80px;
        }
      }
    `}</style>
  );
}
