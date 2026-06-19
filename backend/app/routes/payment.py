from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum
import uuid


# ─────────────────────────────────────────────
#  ENUMS
# ─────────────────────────────────────────────

class PaymentStatus(str, Enum):
    PENDING   = "pending"
    COMPLETED = "completed"
    FAILED    = "failed"
    REFUNDED  = "refunded"
    CANCELLED = "cancelled"

class PaymentMethod(str, Enum):
    CASH         = "cash"
    BANK_TRANSFER= "bank_transfer"
    CREDIT_CARD  = "credit_card"
    MOBILE_MONEY = "mobile_money"
    CHEQUE       = "cheque"

class PaymentType(str, Enum):
    FREIGHT      = "freight"       # customer pays for shipment
    DRIVER_WAGE  = "driver_wage"   # company pays driver
    MAINTENANCE  = "maintenance"   # truck maintenance cost
    FUEL         = "fuel"          # fuel expense
    TOLL         = "toll"          # road toll
    OTHER        = "other"


# ─────────────────────────────────────────────
#  MODELS
# ─────────────────────────────────────────────

class Payment(BaseModel):
    """Represents a single payment transaction."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    payment_type: PaymentType
    method: PaymentMethod
    status: PaymentStatus = PaymentStatus.PENDING

    amount: float                          # e.g. 1500.00
    currency: str = "USD"

    # References to other parts of your system
    trip_id: Optional[str] = None          # which trip this payment is for
    truck_id: Optional[str] = None         # which truck
    driver_id: Optional[str] = None        # which driver
    customer_id: Optional[str] = None      # who is paying (freight payments)

    reference_number: Optional[str] = None # bank ref / receipt number
    notes: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None     # when payment was confirmed


class Invoice(BaseModel):
    """Invoice issued to a customer for freight services."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: str                    # e.g. "INV-2024-0042"
    customer_id: str
    trip_id: str
    truck_id: str
    driver_id: str

    base_amount: float                     # freight charge
    tax_rate: float = 0.16                 # 16% VAT (adjust to your country)
    tax_amount: float = 0.0
    discount: float = 0.0
    total_amount: float = 0.0

    status: PaymentStatus = PaymentStatus.PENDING
    due_date: Optional[datetime] = None
    payments: List[Payment] = []           # partial / full payments applied

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def calculate_totals(self) -> None:
        """Recalculate tax and total."""
        self.tax_amount   = round(self.base_amount * self.tax_rate, 2)
        self.total_amount = round(self.base_amount + self.tax_amount - self.discount, 2)
        self.updated_at   = datetime.utcnow()

    def amount_paid(self) -> float:
        return sum(
            p.amount for p in self.payments
            if p.status == PaymentStatus.COMPLETED
        )

    def balance_due(self) -> float:
        return round(self.total_amount - self.amount_paid(), 2)

    def is_fully_paid(self) -> bool:
        return self.balance_due() <= 0


class DriverWagePayment(BaseModel):
    """Salary / wage payment made to a driver."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    period_start: datetime
    period_end: datetime

    base_salary: float
    trip_bonuses: float = 0.0
    deductions: float = 0.0
    net_amount: float = 0.0

    method: PaymentMethod = PaymentMethod.BANK_TRANSFER
    status: PaymentStatus = PaymentStatus.PENDING
    reference_number: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None

    def calculate_net(self) -> None:
        self.net_amount = round(
            self.base_salary + self.trip_bonuses - self.deductions, 2
        )


class MaintenancePayment(BaseModel):
    """Payment for truck maintenance / repairs."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    truck_id: str
    description: str                       # e.g. "Engine overhaul"
    vendor_name: str
    amount: float
    method: PaymentMethod = PaymentMethod.BANK_TRANSFER
    status: PaymentStatus = PaymentStatus.PENDING
    receipt_number: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None


# ─────────────────────────────────────────────
#  SERVICE LAYER
# ─────────────────────────────────────────────

class PaymentService:
    """
    In-memory payment service.
    Replace the dicts with your database calls (MongoDB, PostgreSQL, etc.).
    """

    def __init__(self):
        self._payments: dict[str, Payment] = {}
        self._invoices: dict[str, Invoice] = {}
        self._wages:    dict[str, DriverWagePayment] = {}
        self._maintenance: dict[str, MaintenancePayment] = {}

    # ── INVOICES ──────────────────────────────

    def create_invoice(
        self,
        invoice_number: str,
        customer_id: str,
        trip_id: str,
        truck_id: str,
        driver_id: str,
        base_amount: float,
        tax_rate: float = 0.16,
        discount: float = 0.0,
        due_date: Optional[datetime] = None,
    ) -> Invoice:
        inv = Invoice(
            invoice_number=invoice_number,
            customer_id=customer_id,
            trip_id=trip_id,
            truck_id=truck_id,
            driver_id=driver_id,
            base_amount=base_amount,
            tax_rate=tax_rate,
            discount=discount,
            due_date=due_date,
        )
        inv.calculate_totals()
        self._invoices[inv.id] = inv
        print(f"[Invoice] Created {inv.invoice_number} | Total: {inv.total_amount} {inv.payments and '' or ''}")
        return inv

    def get_invoice(self, invoice_id: str) -> Optional[Invoice]:
        return self._invoices.get(invoice_id)

    def apply_payment_to_invoice(
        self,
        invoice_id: str,
        amount: float,
        method: PaymentMethod,
        reference_number: Optional[str] = None,
    ) -> Payment:
        inv = self._invoices.get(invoice_id)
        if not inv:
            raise ValueError(f"Invoice {invoice_id} not found.")
        if inv.is_fully_paid():
            raise ValueError("Invoice is already fully paid.")
        if amount > inv.balance_due():
            raise ValueError(
                f"Amount {amount} exceeds balance due {inv.balance_due()}."
            )

        payment = Payment(
            payment_type=PaymentType.FREIGHT,
            method=method,
            amount=amount,
            trip_id=inv.trip_id,
            truck_id=inv.truck_id,
            driver_id=inv.driver_id,
            customer_id=inv.customer_id,
            reference_number=reference_number,
            status=PaymentStatus.COMPLETED,
            paid_at=datetime.utcnow(),
        )
        inv.payments.append(payment)
        self._payments[payment.id] = payment

        if inv.is_fully_paid():
            inv.status = PaymentStatus.COMPLETED
        else:
            inv.status = PaymentStatus.PENDING

        inv.updated_at = datetime.utcnow()
        print(
            f"[Payment] {amount} applied to {inv.invoice_number} | "
            f"Balance remaining: {inv.balance_due()}"
        )
        return payment

    def refund_payment(self, payment_id: str) -> Payment:
        payment = self._payments.get(payment_id)
        if not payment:
            raise ValueError(f"Payment {payment_id} not found.")
        if payment.status != PaymentStatus.COMPLETED:
            raise ValueError("Only completed payments can be refunded.")
        payment.status     = PaymentStatus.REFUNDED
        payment.updated_at = datetime.utcnow()
        print(f"[Refund] Payment {payment_id} refunded.")
        return payment

    # ── DRIVER WAGES ──────────────────────────

    def create_wage_payment(
        self,
        driver_id: str,
        period_start: datetime,
        period_end: datetime,
        base_salary: float,
        trip_bonuses: float = 0.0,
        deductions: float = 0.0,
        method: PaymentMethod = PaymentMethod.BANK_TRANSFER,
    ) -> DriverWagePayment:
        wage = DriverWagePayment(
            driver_id=driver_id,
            period_start=period_start,
            period_end=period_end,
            base_salary=base_salary,
            trip_bonuses=trip_bonuses,
            deductions=deductions,
            method=method,
        )
        wage.calculate_net()
        self._wages[wage.id] = wage
        print(f"[Wage] Driver {driver_id} | Net: {wage.net_amount}")
        return wage

    def mark_wage_paid(self, wage_id: str, reference_number: Optional[str] = None) -> DriverWagePayment:
        wage = self._wages.get(wage_id)
        if not wage:
            raise ValueError(f"Wage record {wage_id} not found.")
        wage.status           = PaymentStatus.COMPLETED
        wage.paid_at          = datetime.utcnow()
        wage.reference_number = reference_number
        print(f"[Wage] Marked as paid: {wage_id}")
        return wage

    # ── MAINTENANCE ───────────────────────────

    def create_maintenance_payment(
        self,
        truck_id: str,
        description: str,
        vendor_name: str,
        amount: float,
        method: PaymentMethod = PaymentMethod.BANK_TRANSFER,
    ) -> MaintenancePayment:
        mp = MaintenancePayment(
            truck_id=truck_id,
            description=description,
            vendor_name=vendor_name,
            amount=amount,
            method=method,
        )
        self._maintenance[mp.id] = mp
        print(f"[Maintenance] Truck {truck_id} | {description} | {amount}")
        return mp

    def mark_maintenance_paid(
        self, mp_id: str, receipt_number: Optional[str] = None
    ) -> MaintenancePayment:
        mp = self._maintenance.get(mp_id)
        if not mp:
            raise ValueError(f"Maintenance payment {mp_id} not found.")
        mp.status         = PaymentStatus.COMPLETED
        mp.paid_at        = datetime.utcnow()
        mp.receipt_number = receipt_number
        print(f"[Maintenance] Paid: {mp_id}")
        return mp

    # ── REPORTS ───────────────────────────────

    def outstanding_invoices(self) -> List[Invoice]:
        return [
            inv for inv in self._invoices.values()
            if not inv.is_fully_paid()
        ]

    def revenue_summary(self) -> dict:
        total_invoiced = sum(i.total_amount for i in self._invoices.values())
        total_collected = sum(
            p.amount for p in self._payments.values()
            if p.status == PaymentStatus.COMPLETED
              and p.payment_type == PaymentType.FREIGHT
        )
        total_wages = sum(
            w.net_amount for w in self._wages.values()
            if w.status == PaymentStatus.COMPLETED
        )
        total_maintenance = sum(
            m.amount for m in self._maintenance.values()
            if m.status == PaymentStatus.COMPLETED
        )
        return {
            "total_invoiced":    round(total_invoiced, 2),
            "total_collected":   round(total_collected, 2),
            "outstanding":       round(total_invoiced - total_collected, 2),
            "total_wages_paid":  round(total_wages, 2),
            "total_maintenance": round(total_maintenance, 2),
            "net_profit":        round(total_collected - total_wages - total_maintenance, 2),
        }


# ─────────────────────────────────────────────
#  QUICK DEMO
# ─────────────────────────────────────────────

if __name__ == "__main__":
    svc = PaymentService()

    # 1. Create a freight invoice
    inv = svc.create_invoice(
        invoice_number="INV-2024-0001",
        customer_id="CUST-001",
        trip_id="TRIP-101",
        truck_id="TRUCK-A1",
        driver_id="DRV-55",
        base_amount=5000.00,
        discount=200.00,
        due_date=datetime(2024, 12, 31),
    )
    print(f"  Balance due: {inv.balance_due()}\n")

    # 2. Apply partial payment
    svc.apply_payment_to_invoice(
        invoice_id=inv.id,
        amount=3000.00,
        method=PaymentMethod.BANK_TRANSFER,
        reference_number="TXN-9988",
    )
    print(f"  Balance due after partial: {inv.balance_due()}\n")

    # 3. Pay remaining balance
    svc.apply_payment_to_invoice(
        invoice_id=inv.id,
        amount=inv.balance_due(),
        method=PaymentMethod.MOBILE_MONEY,
    )
    print(f"  Fully paid: {inv.is_fully_paid()}\n")

    # 4. Driver wage
    wage = svc.create_wage_payment(
        driver_id="DRV-55",
        period_start=datetime(2024, 11, 1),
        period_end=datetime(2024, 11, 30),
        base_salary=1200.00,
        trip_bonuses=150.00,
        deductions=50.00,
    )
    svc.mark_wage_paid(wage.id, reference_number="WAGE-TXN-001")

    # 5. Maintenance payment
    mp = svc.create_maintenance_payment(
        truck_id="TRUCK-A1",
        description="Brake pad replacement",
        vendor_name="AutoParts Ltd",
        amount=320.00,
    )
    svc.mark_maintenance_paid(mp.id, receipt_number="RCPT-77")

    # 6. Summary report
    print("\n── Revenue Summary ──────────────────────")
    for k, v in svc.revenue_summary().items():
        print(f"  {k:<22}: {v}")