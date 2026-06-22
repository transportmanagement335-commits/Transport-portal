import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Truck,
  Car,
  ClipboardList,
  Receipt,
  FileText,
  Settings,
  LogOut
} from "lucide-react";

import { logout } from "../../api";
import "../../styles/Driver/DriverSidebar.css";

function DriverSidebar({ isOpen, closeSidebar }) {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      name: "Dashboard",
      path: "/driver-dashboard",
      icon: <LayoutDashboard size={20} />
    },
    {
      name: "My Trips",
      path: "/driver-trips",
      icon: <Truck size={20} />
    },
    
    {
      name: "Duty Log",
      path: "/driver-duty-log",
      icon: <ClipboardList size={20} />
    },
    {
      name: "Expenses",
      path: "/driver-expenses",
      icon: <Receipt size={20} />
    },
    {
      name: "Documents",
      path: "/driver-documents",
      icon: <FileText size={20} />
    },
    {
      name: "Settings",
      path: "/driver-settings",
      icon: <Settings size={20} />
    }
  ];

  const handleNav = (path) => {
    navigate(path);
    if (closeSidebar && window.innerWidth <= 768) {
      closeSidebar();
    }
  };

  return (
    <aside className={`driver-sidebar ${isOpen ? "open" : "closed"}`}>

      <div className="sidebar-logo">
        <h2>TMS</h2>
        {/* Mobile close button */}
        {isOpen && closeSidebar && window.innerWidth <= 768 && (
          <button 
            onClick={closeSidebar}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#94a3b8", fontSize: "24px", cursor: "pointer" }}
          >
            ✕
          </button>
        )}
      </div>

      <ul>
        {menuItems.map((item) => (
          <li
            key={item.path}
            className={
              location.pathname === item.path
                ? "active"
                : ""
            }
            onClick={() => handleNav(item.path)}
          >
            {item.icon}
            <span>{item.name}</span>
          </li>
        ))}
      </ul>

      <button className="logout-btn" onClick={() => window.confirm("Log out?") && logout()}>
        <LogOut size={18} />
        <span>Logout</span>
      </button>

    </aside>
  );
}

export default DriverSidebar;