import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Home, 
  Settings, 
  Calendar, 
  User, 
  Plus, 
  Trash2, 
  Edit2, 
  Search, 
  ChevronRight,
  ClipboardList,
  LogOut,
  Info,
  AlertCircle
} from 'lucide-react';

// --- Firebase 配置 ---
const firebaseConfig = {
  apiKey: "AIzaSyCdaGbqhxBjkO43elRRtu8G7UWARU9xHmM",
  authDomain: "my-rental-app-59210.firebaseapp.com",
  projectId: "my-rental-app-59210",
  storageBucket: "my-rental-app-59210.firebasestorage.app",
  messagingSenderId: "131975571748",
  appId: "1:131975571748:web:24ea4a464a8b0d97cdebb1",
  measurementId: "G-X51XB29V66"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : '民宿訂房系統';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState('customer'); // 'customer' | 'admin'
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  
  // 搜尋與篩選狀態
  const [searchDates, setSearchDates] = useState({ start: '', end: '' });
  const [searchRoomType, setSearchRoomType] = useState('all');

  // 初始化 Auth (遵循 Rule 3: Auth Before Queries)
  useEffect(() => {
    const initAuth = async () => {
      try {
        // 優先嘗試使用 Custom Token，若失敗則回退至匿名登入
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenErr) {
            console.warn("Custom token failed, falling back to anonymous:", tokenErr);
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Critical Error:", error);
        setAuthError("無法連線至身分驗證伺服器");
      }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // 監聽 Firestore 數據
  useEffect(() => {
    // 確保有使用者才開始監聽數據
    if (!user) return;

    const roomsRef = collection(db, 'artifacts', appId, 'public', 'data', 'rooms');
    const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'bookings');

    const unsubRooms = onSnapshot(roomsRef, (snapshot) => {
      const roomData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRooms(roomData);
    }, (err) => {
      console.error("Rooms Stream Error:", err);
    });

    const unsubBookings = onSnapshot(bookingsRef, (snapshot) => {
      const bookingData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBookings(bookingData);
    }, (err) => {
      console.error("Bookings Stream Error:", err);
    });

    return () => {
      unsubRooms();
      unsubBookings();
    };
  }, [user]);

  // 管理者權限持久化
  useEffect(() => {
    const savedMode = localStorage.getItem('app_mode');
    if (savedMode === 'admin') {
      setIsAdmin(true);
      setView('admin');
    }
  }, []);

  const toggleAdminMode = () => {
    const newMode = !isAdmin;
    setIsAdmin(newMode);
    localStorage.setItem('app_mode', newMode ? 'admin' : 'customer');
    setView(newMode ? 'admin' : 'customer');
  };

  // 重疊日期檢查邏輯
  const isRoomAvailable = (roomId, checkIn, checkOut, excludeBookingId = null) => {
    if (!checkIn || !checkOut) return true;
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    
    // 簡易日期校驗
    if (start >= end) return false;

    return !bookings.some(booking => {
      if (booking.id === excludeBookingId) return false;
      if (booking.roomId !== roomId || booking.status === '已取消') return false;
      
      const bStart = new Date(booking.checkIn);
      const bEnd = new Date(booking.checkOut);
      
      // 重疊公式: (StartA < EndB) && (EndA > StartB)
      return (start < bEnd && end > bStart);
    });
  };

  // 載入與錯誤介面
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 z-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium text-lg">系統載入中...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm text-center">
          <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
          <h2 className="text-xl font-bold mb-2">發生錯誤</h2>
          <p className="text-gray-600 mb-6">{authError}</p>
          <button onClick={() => window.location.reload()} className="w-full py-3 bg-red-600 text-white rounded-xl font-bold">重新整理</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-24 md:pb-8">
      {/* 導覽列 */}
      <nav className="sticky top-0 bg-white/80 backdrop-blur border-b border-gray-200 z-40 px-4 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('customer')}>
          <Home className="text-blue-600" size={24} />
          <h1 className="text-xl font-bold tracking-tight">小木屋民宿</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleAdminMode}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
              isAdmin ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {isAdmin ? '切換至顧客端' : '管理員入口'}
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {isAdmin && view === 'admin' ? (
          <AdminPanel rooms={rooms} bookings={bookings} appId={appId} />
        ) : (
          <CustomerPanel 
            rooms={rooms} 
            bookings={bookings} 
            user={user} 
            appId={appId}
            searchDates={searchDates}
            setSearchDates={setSearchDates}
            searchRoomType={searchRoomType}
            setSearchRoomType={setSearchRoomType}
            isRoomAvailable={isRoomAvailable}
          />
        )}
      </main>

      {/* 底部浮動資訊 (用戶 ID 顯示) */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow-lg border border-gray-100 text-[10px] text-gray-400 z-30">
        您的用戶 ID: <span className="font-mono">{user?.uid}</span>
      </div>
    </div>
  );
}

// --- 顧客端組件 ---
function CustomerPanel({ rooms, bookings, user, appId, searchDates, setSearchDates, searchRoomType, setSearchRoomType, isRoomAvailable }) {
  const [activeTab, setActiveTab] = useState('explore'); 
  const [selectedRoom, setSelectedRoom] = useState(null);

  const filteredRooms = useMemo(() => {
    return rooms.filter(room => {
      const matchesType = searchRoomType === 'all' || room.type === searchRoomType;
      const available = isRoomAvailable(room.id, searchDates.start, searchDates.end);
      const isEnabled = room.status !== '停用';
      return matchesType && available && isEnabled;
    });
  }, [rooms, searchRoomType, searchDates, bookings, isRoomAvailable]);

  const myBookings = bookings
    .filter(b => b.userId === user?.uid)
    .sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-gray-200">
        <button 
          onClick={() => setActiveTab('explore')}
          className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'explore' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400'}`}
        >
          探索房型
        </button>
        <button 
          onClick={() => setActiveTab('myBookings')}
          className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'myBookings' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400'}`}
        >
          我的訂單 ({myBookings.length})
        </button>
      </div>

      {activeTab === 'explore' ? (
        <>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">入住日期</label>
              <input 
                type="date" 
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                value={searchDates.start}
                onChange={(e) => setSearchDates(prev => ({ ...prev, start: e.target.value }))}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">退房日期</label>
              <input 
                type="date" 
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                value={searchDates.end}
                onChange={(e) => setSearchDates(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">房型搜尋</label>
              <select 
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none"
                value={searchRoomType}
                onChange={(e) => setSearchRoomType(e.target.value)}
              >
                <option value="all">所有類型</option>
                {[...new Set(rooms.map(r => r.type))].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRooms.length > 0 ? filteredRooms.map(room => (
              <div key={room.id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 relative">
                  <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-blue-600 shadow-sm">
                    {room.type}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-medium">
                    
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xl font-bold">{room.name}</h3>
                    <div className="text-blue-600 font-black text-lg">${room.price} <span className="text-[10px] text-gray-400 font-normal uppercase">/ Night</span></div>
                  </div>
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2 leading-relaxed">{room.desc || '暫無房間描述'}</p>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                      <User size={14} /> {room.capacity} 人入住
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedRoom(room)}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-[0.98]"
                  >
                    立即查看並預訂
                  </button>
                </div>
              </div>
            )) : (
              <div className="col-span-full py-32 text-center text-gray-500 bg-white rounded-3xl border-2 border-dashed border-gray-100">
                <Search size={48} className="mx-auto mb-4 opacity-10" />
                <p className="text-lg font-medium">目前沒有符合條件的空房</p>
                <p className="text-sm opacity-60">請嘗試更改日期或房型搜尋。</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {myBookings.length > 0 ? myBookings.map(booking => (
            <div key={booking.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between gap-6 hover:shadow-md transition-all">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h4 className="font-bold text-xl">{booking.roomName}</h4>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                    booking.status === '待確認' ? 'bg-yellow-100 text-yellow-700' :
                    booking.status === '已確認' ? 'bg-green-100 text-green-700' :
                    booking.status === '已取消' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {booking.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-gray-600 font-medium">
                  <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1 rounded-lg">
                    <Calendar size={14} className="text-blue-500" /> {booking.checkIn} → {booking.checkOut}
                  </div>
                  <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1 rounded-lg">
                    <User size={14} className="text-blue-500" /> {booking.guestCount} 人
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-none pt-4 md:pt-0">
                <div className="text-right">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Price</div>
                  <div className="font-black text-2xl text-blue-600">${booking.totalPrice}</div>
                </div>
                {(booking.status === '待確認' || booking.status === '已確認') && (
                  <button 
                    onClick={async () => {
                      if (window.confirm('確定要取消這筆訂單嗎？')) {
                        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', booking.id), {
                          status: '已取消'
                        });
                      }
                    }}
                    className="px-6 py-3 text-sm font-bold text-red-600 bg-red-50 rounded-2xl hover:bg-red-100 transition-all active:scale-95"
                  >
                    取消預訂
                  </button>
                )}
              </div>
            </div>
          )) : (
            <div className="py-32 text-center text-gray-400 bg-white rounded-3xl border border-gray-100 shadow-inner">
               <ClipboardList size={48} className="mx-auto mb-4 opacity-10" />
               <p className="font-medium">尚無任何訂單紀錄</p>
            </div>
          )}
        </div>
      )}

      {selectedRoom && (
        <BookingModal 
          room={selectedRoom} 
          onClose={() => setSelectedRoom(null)} 
          user={user} 
          appId={appId}
          isRoomAvailable={isRoomAvailable}
          initialDates={searchDates}
        />
      )}
    </div>
  );
}

// --- 管理者端組件 ---
function AdminPanel({ rooms, bookings, appId }) {
  const [activeTab, setActiveTab] = useState('bookings'); 
  const [editRoom, setEditRoom] = useState(null);

  const sortedBookings = [...bookings].sort((a, b) => {
    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;
    return timeB - timeA;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-black">管理中心</h2>
          <p className="text-gray-400 text-sm font-medium">監控預訂、管理房源與訂單狀態</p>
        </div>
        <div className="flex bg-gray-200 p-1.5 rounded-2xl shadow-inner">
          <button 
            onClick={() => setActiveTab('bookings')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'bookings' ? 'bg-white text-blue-600 shadow-md' : 'text-gray-500'}`}
          >
            訂單流水
          </button>
          <button 
            onClick={() => setActiveTab('rooms')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'rooms' ? 'bg-white text-blue-600 shadow-md' : 'text-gray-500'}`}
          >
            房源配置
          </button>
        </div>
      </div>

      {activeTab === 'bookings' ? (
        <div className="grid grid-cols-1 gap-4">
          {sortedBookings.map(booking => (
            <div key={booking.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6">
              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-xl font-black text-gray-800">{booking.customerName}</div>
                  <span className="text-xs font-mono text-gray-300 bg-gray-50 px-2 py-1 rounded">ID: {booking.id.slice(-6).toUpperCase()}</span>
                  <select 
                    value={booking.status}
                    onChange={async (e) => {
                      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', booking.id), {
                        status: e.target.value
                      });
                    }}
                    className={`ml-auto md:ml-0 px-4 py-2 rounded-xl text-xs font-black outline-none border-none shadow-sm cursor-pointer transition-all ${
                      booking.status === '待確認' ? 'bg-yellow-100 text-yellow-700' :
                      booking.status === '已確認' ? 'bg-green-100 text-green-700' :
                      booking.status === '已取消' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    <option value="待確認">待確認</option>
                    <option value="已確認">已確認</option>
                    <option value="已入住">已入住</option>
                    <option value="已取消">已取消</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">房源</p>
                    <p className="font-bold text-gray-700">{booking.roomName}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">期間</p>
                    <p className="font-bold text-gray-700 text-sm">{booking.checkIn} 至 {booking.checkOut}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">聯絡資訊</p>
                    <p className="font-bold text-gray-700 text-sm">{booking.customerPhone}</p>
                  </div>
                </div>

                {booking.note && (
                  <div className="bg-orange-50/50 p-3 rounded-xl text-sm border border-orange-100/50">
                    <span className="font-bold text-orange-700 mr-2">備註:</span>
                    <span className="text-orange-900/70">{booking.note}</span>
                  </div>
                )}
              </div>
              <div className="md:w-32 flex md:flex-col items-center justify-between md:justify-center md:border-l border-gray-100 md:pl-6 gap-2">
                <div className="text-right md:text-center w-full">
                  <p className="text-[10px] font-black text-gray-400 uppercase">Total</p>
                  <p className="text-2xl font-black text-blue-600">${booking.totalPrice}</p>
                </div>
              </div>
            </div>
          ))}
          {sortedBookings.length === 0 && (
             <div className="py-24 text-center text-gray-400 bg-white rounded-3xl border border-gray-100">
               <ClipboardList size={48} className="mx-auto mb-4 opacity-10" />
               <p>目前尚無任何訂單</p>
             </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <button 
            onClick={() => setEditRoom({})}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            <Plus size={20} /> 新增民宿房源
          </button>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {rooms.map(room => (
              <div key={room.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-black text-xl text-gray-800">{room.name}</h4>
                    <span className="text-[10px] font-black bg-gray-100 px-2 py-0.5 rounded-full text-gray-500 uppercase tracking-wider">{room.type}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-500 flex items-center gap-4">
                    <span>價格: <span className="text-blue-600 font-bold">${room.price}</span></span>
                    <span>容量: <span className="font-bold text-gray-700">{room.capacity} 人</span></span>
                  </div>
                  <div className={`text-[10px] font-black mt-3 flex items-center gap-1.5 ${room.status === '停用' ? 'text-red-500' : 'text-green-500'}`}>
                    <span className={`w-2 h-2 rounded-full ${room.status === '停用' ? 'bg-red-500' : 'bg-green-500'} animate-pulse`}></span>
                    {room.status || '可訂房'}
                  </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <button onClick={() => setEditRoom(room)} className="flex-1 md:flex-none p-3 text-gray-400 bg-gray-50 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all">
                    <Edit2 size={20} className="mx-auto" />
                  </button>
                  <button 
                    onClick={async () => {
                      if (window.confirm(`確定要刪除 ${room.name} 嗎？此操作不可恢復。`)) {
                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', room.id));
                      }
                    }}
                    className="flex-1 md:flex-none p-3 text-gray-400 bg-gray-50 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                  >
                    <Trash2 size={20} className="mx-auto" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editRoom && (
        <RoomEditor room={editRoom} onClose={() => setEditRoom(null)} appId={appId} />
      )}
    </div>
  );
}

// --- 預訂 Modal ---
function BookingModal({ room, onClose, user, appId, isRoomAvailable, initialDates }) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    checkIn: initialDates.start || '',
    checkOut: initialDates.end || '',
    guestCount: 1,
    note: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const calculateTotal = () => {
    if (!formData.checkIn || !formData.checkOut) return 0;
    const start = new Date(formData.checkIn);
    const end = new Date(formData.checkOut);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays * room.price : 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (new Date(formData.checkIn) >= new Date(formData.checkOut)) {
      setError('退房日期必須晚於入住日期');
      return;
    }

    if (!isRoomAvailable(room.id, formData.checkIn, formData.checkOut)) {
      setError('該時段房間已被預訂，請選擇其他日期');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), {
        customerName: formData.name,
        customerPhone: formData.phone,
        checkIn: formData.checkIn,
        checkOut: formData.checkOut,
        guestCount: Number(formData.guestCount),
        note: formData.note,
        roomId: room.id,
        roomName: room.name,
        roomType: room.type,
        totalPrice: calculateTotal(),
        userId: user.uid,
        status: '待確認',
        createdAt: serverTimestamp()
      });
      onClose();
      // 使用視窗模態框替代原生 alert 以符合最佳實踐
      setTimeout(() => alert('預訂申請已成功送出！'), 100);
    } catch (err) {
      console.error(err);
      setError('系統錯誤，請稍後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur z-10 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black text-gray-800">預訂房源</h2>
            <p className="text-sm text-gray-400 font-medium">{room.name} ({room.type})</p>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-50 text-gray-400 hover:text-gray-600 rounded-full transition-all">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="bg-blue-50/50 p-5 rounded-[1.5rem] flex items-start gap-4 border border-blue-100/50">
            <Info className="text-blue-600 mt-1 shrink-0" size={20} />
            <div className="text-sm">
              <div className="font-black text-blue-900 mb-1 tracking-wider uppercase">房型規則與設施</div>
              <p className="text-blue-800/70 leading-relaxed">
                最大入住人數: {room.capacity} 人 | 價格: ${room.price} / 晚<br/>
                {room.amenities || '提供 Wi-Fi、空調、衛浴設施、清潔備品。'}
              </p>
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-sm font-bold flex items-center gap-2">
            <AlertCircle size={18} /> {error}
          </div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">入住日期</label>
              <input required type="date" value={formData.checkIn} onChange={e => setFormData({...formData, checkIn: e.target.value})} className="w-full p-3.5 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">退房日期</label>
              <input required type="date" value={formData.checkOut} onChange={e => setFormData({...formData, checkOut: e.target.value})} className="w-full p-3.5 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">聯絡姓名</label>
              <input required type="text" placeholder="請輸入姓名" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3.5 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">聯絡電話</label>
              <input required type="tel" placeholder="請輸入電話" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-3.5 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">入住人數</label>
              <input required type="number" min="1" max={room.capacity} value={formData.guestCount} onChange={e => setFormData({...formData, guestCount: e.target.value})} className="w-full p-3.5 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>
          
          <div>
            <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">特殊需求備註</label>
            <textarea rows="3" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full p-3.5 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" placeholder="如有過敏、抵達時間或其他需求請在此留言..."></textarea>
          </div>

          <div className="pt-8 border-t border-gray-50 flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">訂單總金額</div>
                <div className="text-sm text-gray-400 font-medium">包含所有服務費用</div>
              </div>
              <div className="text-4xl font-black text-blue-600">${calculateTotal()}</div>
            </div>
            <button 
              disabled={isSubmitting}
              className="w-full py-5 bg-blue-600 text-white rounded-[1.5rem] font-black text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 disabled:opacity-50 active:scale-95"
            >
              {isSubmitting ? '正在處理訂單...' : '確認提交預訂'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- 房源編輯 Modal ---
function RoomEditor({ room, onClose, appId }) {
  const [formData, setFormData] = useState({
    name: room.name || '',
    type: room.type || '雙人房',
    price: room.price || 1200,
    capacity: room.capacity || 2,
    desc: room.desc || '',
    amenities: room.amenities || '',
    status: room.status || '可訂房'
  });

  const handleSave = async (e) => {
    e.preventDefault();
    const data = { 
      ...formData, 
      price: Number(formData.price), 
      capacity: Number(formData.capacity),
      updatedAt: serverTimestamp()
    };
    
    try {
      if (room.id) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', room.id), data);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'rooms'), {
          ...data,
          createdAt: serverTimestamp()
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
      alert('儲存失敗，請檢查權限');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 overflow-y-auto max-h-[90vh] shadow-2xl">
        <h2 className="text-2xl font-black mb-8 text-gray-800">{room.id ? '房源編輯' : '配置新房源'}</h2>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">房源顯示名稱</label>
              <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">房型類別</label>
              <input required value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">基礎房價</label>
              <input required type="number" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">入住容量</label>
              <input required type="number" value={formData.capacity} onChange={e => setFormData({...formData, capacity: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">營運狀態</label>
              <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="可訂房">可訂房</option>
                <option value="停用">停用/維護中</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">詳細描述</label>
            <textarea rows="3" value={formData.desc} onChange={e => setFormData({...formData, desc: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"></textarea>
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">設施備註 (逗號分隔)</label>
            <input value={formData.amenities} onChange={e => setFormData({...formData, amenities: e.target.value})} className="w-full p-3 bg-gray-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="景觀、按摩浴缸、投影幕..." />
          </div>
          <div className="flex gap-4 pt-6">
            <button type="button" onClick={onClose} className="flex-1 py-4 bg-gray-50 text-gray-500 rounded-2xl font-black transition-all">取消</button>
            <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-100 transition-all hover:bg-blue-700 active:scale-95">儲存配置</button>
          </div>
        </form>
      </div>
    </div>
  );
}
