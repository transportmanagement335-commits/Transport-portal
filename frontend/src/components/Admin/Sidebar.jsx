import { useLocation, useNavigate } from "react-router-dom";
import { logout } from "../../api";

import {
  FiHome,
  FiTruck,
  FiUsers,
  FiMap,
  FiFileText,
  FiCreditCard,
  FiSettings,
  FiLogOut,
  FiDollarSign,
  FiUserCheck,
  FiClipboard,
} from "react-icons/fi";

import "../../styles/Admin/sidebar.css";

function Sidebar({ sidebarOpen }) {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      name: "Dashboard",
      path: "/admin-dashboard",
      icon: <FiHome />,
    },
    {
      name: "Vehicles",
      path: "/vehicles",
      icon: <FiTruck />,
    },
    {
      name: "Drivers",
      path: "/drivers",
      icon: <FiUsers />,
    },
    {
      name: "Trips",
      path: "/trips",
      icon: <FiMap />,
    },
    {
      name: "Documents",
      path: "/documents",
      icon: <FiFileText />,
    },
    {
      name: "Payment & Balance",
      path: "/payments",
      icon: <FiCreditCard />,
    },
    {
      name: "Expenses",
      path: "/expenses",
      icon: <FiDollarSign />,
    },
    {
      name: "Customers",
      path: "/customers",
      icon: <FiUserCheck />,
    },
    {
      name: "Invoices",
      path: "/invoices",
      icon: <FiClipboard />,
    },
    {
      name: "Settings",
      path: "/settings",
      icon: <FiSettings />,
    },
  ];

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to log out?")) {
      logout();
    }
  };

  return (
    <aside
      className={`sidebar ${
        sidebarOpen ? "sidebar-show" : "sidebar-hide"
      }`}
    >
      {/* Logo */}
      <div className="sidebar-header">
        <h2 className="sidebar-logo">TMS Admin</h2>
      </div>

      {/* Navigation */}
      <ul className="sidebar-menu">
        {menuItems.map((item, index) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === "/vehicles" &&
              location.pathname === "/vehicle-details") ||
            (item.path === "/trips" &&
              location.pathname === "/trip-details") ||
            (item.path === "/payments" &&
              location.pathname === "/payment-details") ||
            (item.path === "/customers" &&
              location.pathname.startsWith("/customers")) ||
            (item.path === "/invoices" &&
              (location.pathname.startsWith("/invoices")));

          return (
            <li
              key={index}
              className={isActive ? "active" : ""}
              onClick={() => navigate(item.path)}
            >
              <span className="sidebar-icon">
                {item.icon}
              </span>

              <span>{item.name}</span>
            </li>
          );
        })}
      </ul>

      {/* Logout */}
      <div className="sidebar-footer">
        <div className="logout-btn" onClick={handleLogout}>
          <FiLogOut />
          <span>Logout</span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;