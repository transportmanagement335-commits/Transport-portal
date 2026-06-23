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

import "../../styles/Driver/DriverSidebar.css";

function DriverSidebar({ isOpen }) {
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

  return (
    <aside className={`driver-sidebar ${isOpen ? "open" : "closed"}`}>

      <div className="sidebar-logo">
        {/* <h2>TMS </h2> */}
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
            onClick={() => navigate(item.path)}
          >
            {item.icon}
            <span>{item.name}</span>
          </li>
        ))}
      </ul>

      <button className="logout-btn">
        <LogOut size={18} />
        <span>Logout</span>
      </button>

    </aside>
  );
}

export default DriverSidebar;


