# Nirmala Matha Central School - IT Complaint Register & Admin Portal

A modern, responsive IT Helpdesk & Complaint Management web application created specifically for **Nirmala Matha Central School (NMCS)**.

Features official school crest branding (*Light & Life*), mandatory teacher mobile number input with instant **Ticket Token dispatch via WhatsApp and SMS**, teacher ticket lookup, and a secure password-protected IT Admin Panel.

---

## Running & Accessing the Application

### 1. Live Public Website (Active Online)
- **Public URL**: **[https://solar-lucky-codes-mounted.trycloudflare.com](https://solar-lucky-codes-mounted.trycloudflare.com)**
- Fully accessible worldwide from any smartphone, tablet, classroom laptop, or smart board!
- Secured with Cloudflare SSL encryption.

### 2. Direct Browser Open (Offline Ready, Zero Setup)
- Double-click **`index.html`** in Microsoft Edge, Google Chrome, Mozilla Firefox, or any modern web browser.
- Operates immediately without installing any server or runtimes!

### 3. Local School LAN / Wi-Fi Access
- Double-click **`Start-Server.bat`** (or run `Start-Server.ps1`).
- Open **`http://localhost:8080/`** on this computer.
- Other teachers on the school Wi-Fi or LAN can access it directly via your PC's IP address (e.g. `http://192.168.1.xxx:8080/`).

### 4. Re-Publish / Refresh Public Link Anytime
- Double-click **`Publish-Online.bat`** to generate a new live public link whenever needed.

---

## IT Admin Credentials

| Role | Security ID | Password | Access Rights |
| :--- | :--- | :--- | :--- |
| **IT Administrator** | `nmcs` | `admin@nmcs` | Full access to view complaint statuses, set priority levels, update statuses, assign technicians, dispatch WhatsApp/SMS updates, and export reports |
| **Teachers / Staff** | *None required* | *None required* | Lodge complaints, receive instant Ticket Token via WhatsApp / SMS, and track individual ticket status |

---

## Key Features & Workflow

### 1. Teacher Complaint Registration Portal
- **Official School Emblem**: Features the official Nirmala Matha Central School crest.
- **Teacher Information Required**:
  - **Teacher's Name**
  - **Class / Grade** (Class 1 to 12, Kindergarten, Labs, Staff Room, etc.)
  - **Division / Section** (Division A, B, C, D, E, General)
  - **Mobile Number (Mandatory)**: 10-digit mobile number for WhatsApp & SMS ticket token delivery.
  - **Room / Location** (Optional)
- **Complaint Category Dropdown**:
  1. `Extramarks not working`
  2. `TEACHERS & STUDENTS PRESENTATIONS not working`
  3. `network issue`
  4. `Smart Board not working`
  5. `other issue` (prompts for specific description)
- **Urgency / Initial Priority**:
  - `High - Class In Session / Active Teaching`
  - `Urgent - Ongoing Exam / Principal Office`
  - `Medium - Normal Class Requirement`
  - `Low - Minor Glitch / Preventive`

### 2. Instant Ticket Token & WhatsApp / SMS Dispatch
- **Unique Ticket Token**: Generated sequentially (e.g., `NMCS-IT-2026-0001`).
- **1-Click WhatsApp Button**: Opens WhatsApp Web / Mobile App with the full ticket receipt and token pre-formatted to send to the teacher's registered phone number or forward to IT staff.
- **1-Click SMS Button**: Opens native mobile text messaging with the ticket confirmation.
- **Teacher Self-Tracking**: Search bar allows teachers to track their real-time repair status using their Token ID or Mobile Number without needing admin login.
- **Print Receipt Slip**: One-click printable receipt slip.

### 3. Clean Database (Zero Demo Records)
- Starts with an empty database (`0` demo complaints) ready for real production use by the school.
- No dummy teachers or placeholder complaints.

### 4. Protected IT Admin Register
- **Security Lock Gate**: Requires Security ID `nmcs` and Password `admin@nmcs`.
- **Complaint Priority Control**: Urgent, High, Medium, Low.
- **Complaint Status Control**: Pending, In Progress, Resolved, Closed.
- **Technician Dispatch**: Assign to on-duty IT team.
- **Notify Teacher via WhatsApp & SMS**: Direct 1-click WhatsApp and SMS buttons inside each ticket to send status updates directly to the teacher's mobile phone!
- **Official Printouts & Exports**: Single ticket slip, daily work sheet, management summary, and Excel/CSV export.
