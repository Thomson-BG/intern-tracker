import React, { useState, useEffect, useCallback } from 'react';
import useLocalStorage from './hooks/useLocalStorage';
import { Tab, TimeLog, AbsenceLog, UserInfo, LocationState } from './types';
import AdminPanel from './components/AdminPanel';
import { downloadTimeLogsPDF } from './utils/downloadHelpers';

// --- HELPER FUNCTIONS ---
const getDeviceId = async () => {
    const text = navigator.userAgent + (navigator.languages.join(',')) + (new Date().getTimezoneOffset()) + (window.screen.height * window.screen.width);
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const fetchLocation = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
        if (!("geolocation" in navigator)) {
            reject(new Error('Geolocation is not available in your browser.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000, // 10 seconds
            maximumAge: 0 // Don't use a cached position
        });
    });
};


// --- UI COMPONENTS (Defined outside main App component to prevent re-creation on re-renders) ---

const Header: React.FC = () => (
    <div className="bg-blue-600 p-6 text-white rounded-t-xl">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold">Bulldog Garage Intern Time & Absence Tracker</h1>
                <p className="text-blue-100">Record your hours, absences, and view your timesheet</p>
            </div>
            <div className="text-4xl text-blue-200">
                <i className="fas fa-clock"></i>
            </div>
        </div>
    </div>
);

interface TabBarProps {
    activeTab: Tab;
    setActiveTab: (tab: Tab) => void;
}
const TabBar: React.FC<TabBarProps> = ({ activeTab, setActiveTab }) => (
    <div className="mb-6 flex space-x-1 border-b border-gray-200">
        {(Object.keys(Tab) as Array<keyof typeof Tab>).map((key) => {
            const tab = Tab[key];
            const isActive = activeTab === tab;
            return (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-3 font-bold text-sm -mb-px border-b-2 transition-colors duration-200 ${
                        isActive 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-blue-600 hover:border-blue-300'
                    }`}
                >
                    {tab}
                </button>
            );
        })}
    </div>
);

interface StatusDisplayProps {
    type: 'success' | 'error' | 'info';
    title: string;
    details: string;
}
const StatusDisplay: React.FC<StatusDisplayProps> = ({ type, title, details }) => {
    const colorClasses = {
        success: { bg: 'bg-green-50', border: 'border-green-300', icon: 'fa-check-circle text-green-500' },
        error: { bg: 'bg-red-50', border: 'border-red-300', icon: 'fa-times-circle text-red-500' },
        info: { bg: 'bg-blue-50', border: 'border-blue-300', icon: 'fa-info-circle text-blue-500' },
    };
    const { bg, border, icon } = colorClasses[type];

    return (
        <div className={`p-4 rounded-lg border shadow-sm mb-6 flex items-start space-x-3 slide-in ${bg} ${border}`}>
            <div className="text-2xl pt-1">
                <i className={`fas ${icon}`}></i>
            </div>
            <div>
                <h3 className="font-bold text-lg text-gray-800">{title}</h3>
                <p className="text-sm text-gray-600">{details}</p>
            </div>
        </div>
    );
};

interface UserInfoFormProps {
    userInfo: UserInfo;
    setUserInfo: (info: UserInfo) => void;
}
const UserInfoForm: React.FC<UserInfoFormProps> = ({ userInfo, setUserInfo }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUserInfo({ ...userInfo, [e.target.name]: e.target.value });
    };

    return (
        <div className="mb-8 slide-in">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">1. Your Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys(userInfo).filter(k => k !== 'deviceName').map(key => (
                    <div key={key}>
                        <label htmlFor={key} className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                            {key.replace('Id', ' ID').replace('Name', ' Name')}
                        </label>
                        <input type="text" id={key} name={key} value={(userInfo as any)[key]} onChange={handleChange} required className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-50 text-gray-900 placeholder:text-gray-500" />
                    </div>
                ))}
            </div>
            <div className="mt-4">
                <label htmlFor="deviceName" className="block text-sm font-medium text-gray-700 mb-1">Device Name (e.g., My Phone, Lab PC)</label>
                <input type="text" id="deviceName" name="deviceName" value={userInfo.deviceName} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-50 text-gray-900 placeholder:text-gray-500" placeholder="Optional" />
            </div>
        </div>
    );
};

interface TimePanelProps {
    userInfo: UserInfo;
    setUserInfo: (info: UserInfo) => void;
    onLogAction: (action: 'IN' | 'OUT') => void;
    location: LocationState;
    isLogging: boolean;
}
const TimePanel: React.FC<TimePanelProps> = ({ userInfo, setUserInfo, onLogAction, location, isLogging }) => {

    const ActionButton: React.FC<{ action: 'IN' | 'OUT' }> = ({ action }) => {
        const isOut = action === 'OUT';
        const color = isOut ? 'red' : 'green';
        const icon = isOut ? 'fa-sign-out-alt' : 'fa-sign-in-alt';

        return (
            <button
                onClick={() => onLogAction(action)}
                disabled={isLogging}
                className={`bg-${color}-600 hover:bg-${color}-700 text-white font-bold py-4 px-4 rounded-lg flex items-center justify-center space-x-3 transition duration-300 transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:scale-100`}
            >
                {isLogging ? (
                    <>
                        <i className="fas fa-spinner fa-spin"></i>
                        <span>PROCESSING...</span>
                    </>
                ) : (
                    <>
                        <i className={`fas ${icon}`}></i>
                        <span>CHECK {action}</span>
                    </>
                )}
            </button>
        );
    };

    return (
        <div className="slide-in">
            <UserInfoForm userInfo={userInfo} setUserInfo={setUserInfo} />
            <h2 className="text-xl font-semibold mb-4 text-gray-800">2. Clock In / Out</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <ActionButton action="IN" />
                <ActionButton action="OUT" />
            </div>
             <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-sm">
                <h2 className="text-lg font-semibold mb-2 text-gray-800">Location Information</h2>
                <div className="space-y-2">
                    <div className="flex items-center">
                        <i className={`fas fa-map-marker-alt mr-2 ${location.error ? 'text-red-500' : 'text-green-500'}`}></i>
                        <span>{location.status}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                        <p>Latitude: <span className="font-mono">{location.latitude?.toFixed(5) || '-'}</span></p>
                        <p>Longitude: <span className="font-mono">{location.longitude?.toFixed(5) || '-'}</span></p>
                        <p>Accuracy: <span className="font-mono">{location.accuracy?.toFixed(0) || '-'} meters</span></p>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface AbsencePanelProps {
    userInfo: UserInfo;
    onAddAbsence: (date: string, reason: string) => void;
}
const AbsencePanel: React.FC<AbsencePanelProps> = ({ userInfo, onAddAbsence }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [reason, setReason] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAddAbsence(date, reason);
        setReason('');
    };

    return (
        <div className="slide-in">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Log an Absence</h2>
            <form onSubmit={handleSubmit} className="space-y-4 mb-6 p-4 bg-gray-50 border rounded-lg">
                <div>
                    <label htmlFor="absenceDate" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input type="date" id="absenceDate" value={date} onChange={e => setDate(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-50 text-gray-900" />
                </div>
                <div>
                    <label htmlFor="absenceReason" className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                    <input type="text" id="absenceReason" value={reason} onChange={e => setReason(e.target.value)} required maxLength={100} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-50 text-gray-900 placeholder:text-gray-500" placeholder="E.g., Sick, Family, Academic..." />
                </div>
                <button type="submit" className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-md transition duration-300 transform hover:scale-105">
                    Submit Absence
                </button>
            </form>
        </div>
    );
};

interface TimesheetPanelProps {
    logs: TimeLog[];
    userInfo: UserInfo;
}
const TimesheetPanel: React.FC<TimesheetPanelProps> = ({ logs, userInfo }) => {
    const [studentId, setStudentId] = useState(userInfo.employeeId);
    const [filteredLogs, setFilteredLogs] = useState<TimeLog[]>([]);

    const loadTimesheet = useCallback(() => {
        const userLogs = logs.filter(log => log.employeeId === studentId).sort((a,b) => b.rawTimestamp - a.rawTimestamp);
        setFilteredLogs(userLogs);
    }, [logs, studentId]);

    useEffect(() => {
        if(studentId) {
            loadTimesheet();
        }
    }, [studentId, logs, loadTimesheet]);

    const handleDownloadPdf = () => {
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        
        let namePart = 'User';
        if (userInfo.firstName && userInfo.lastName) {
            namePart = `${userInfo.firstName.charAt(0).toUpperCase()}_${userInfo.lastName}`;
        }
        
        const prefix = `${namePart}_${date}_${time}`;
        downloadTimeLogsPDF(filteredLogs, `Timesheet for ${studentId}`, prefix);
    };

    return (
        <div className="slide-in">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-gray-800">My Timesheet</h2>
                    <div className="flex items-center space-x-2 mt-2">
                        <label htmlFor="timesheetStudentId" className="text-sm font-medium text-gray-700">Student ID:</label>
                        <input type="text" id="timesheetStudentId" value={studentId} onChange={e => setStudentId(e.target.value)} className="px-2 py-1 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-sm bg-gray-50 text-gray-900 placeholder:text-gray-500" placeholder="Enter Student ID" />
                        <button onClick={loadTimesheet} type="button" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm">Load</button>
                    </div>
                </div>
                <button onClick={handleDownloadPdf} disabled={!filteredLogs.length} className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-md text-sm disabled:bg-gray-400 disabled:cursor-not-allowed">
                    Download PDF
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full bg-white border">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredLogs.length > 0 ? filteredLogs.map((log, i) => (
                             <tr key={`${log.rawTimestamp}-${i}`} className="hover:bg-gray-50">
                                <td className={`px-4 py-2 whitespace-nowrap font-medium ${log.action === 'IN' ? 'text-green-600' : 'text-red-600'}`}>{log.action}</td>
                                <td className="px-4 py-2 whitespace-nowrap">{log.timestamp}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{log.deviceName}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{log.action === 'OUT' ? (log.duration || '') : ''}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan={4} className="text-center py-4 text-gray-500">No records found for this ID.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

interface AdminLoginProps {
    onLogin: (pass: boolean) => void;
}
const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // In a real app, this would be a secure API call.
        if (username === 'admin' && password === 'password123') {
            onLogin(true);
        } else {
            onLogin(false);
        }
    };

    return (
        <div className="mt-8 border-t pt-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Admin Login</h2>
            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-50 text-gray-900" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-gray-50 text-gray-900" />
                </div>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 transform hover:scale-105">
                    Login
                </button>
            </form>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
    const [userInfo, setUserInfo] = useLocalStorage<UserInfo>('userInfo', { firstName: '', lastName: '', employeeId: '', deviceName: '' });
    const [timeLogs, setTimeLogs] = useLocalStorage<TimeLog[]>('timeLogs', []);
    const [absenceLogs, setAbsenceLogs] = useLocalStorage<AbsenceLog[]>('absenceLogs', []);
    const [activeTab, setActiveTab] = useState<Tab>(Tab.Time);
    const [isAdmin, setIsAdmin] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; title: string; details: string } | null>(null);
    const [isLogging, setIsLogging] = useState(false);
    const [location, setLocation] = useState<LocationState>({ status: 'Location will be captured on check-in/out.' });


    const clearStatus = () => setTimeout(() => setStatus(null), 5000);
    
    const handleLogAction = async (action: 'IN' | 'OUT') => {
        const { firstName, lastName, employeeId } = userInfo;
        if (!firstName || !lastName || !employeeId) {
            setStatus({ type: 'error', title: 'Missing Information', details: 'Please fill out your first name, last name, and student ID.' });
            clearStatus();
            return;
        }

        setIsLogging(true);
        setStatus({ type: 'info', title: 'Processing...', details: 'Acquiring your location. Please wait.' });

        try {
            const position = await fetchLocation();
            const { latitude, longitude, accuracy } = position.coords;

            setLocation({ latitude, longitude, accuracy, status: 'Location acquired successfully.' });

            const now = new Date();
            const day = now.getDay();
            if ([0, 5, 6].includes(day)) { // Sun, Fri, Sat
                setStatus({ type: 'error', title: 'Not Allowed', details: 'Check-in and check-out are only allowed Monday-Thursday.' });
                setIsLogging(false); // Make sure to stop logging state
                clearStatus();
                return;
            }

            const deviceId = await getDeviceId();
            
            let durationString: string | undefined = undefined;
            let durationDetails = "";

            if (action === 'OUT') {
                const todayStr = now.toDateString();
                const lastCheckIn = timeLogs
                    .filter(log => 
                        log.employeeId === employeeId && 
                        log.action === 'IN' && 
                        new Date(log.rawTimestamp).toDateString() === todayStr
                    )
                    .sort((a, b) => b.rawTimestamp - a.rawTimestamp)[0];

                if (lastCheckIn) {
                    const diffMs = now.getTime() - lastCheckIn.rawTimestamp;
                    if (diffMs > 0) {
                        const totalMinutes = Math.floor(diffMs / 60000);
                        const hours = Math.floor(totalMinutes / 60);
                        const minutes = totalMinutes % 60;
                        durationString = `${hours} hours, ${minutes} minutes`;
                        durationDetails = ` Today's total time: ${durationString}.`;
                    }
                }
            }
            
            const newLog: TimeLog = {
                ...userInfo,
                action,
                timestamp: now.toLocaleString(),
                rawTimestamp: now.getTime(),
                latitude,
                longitude,
                accuracy,
                deviceId,
                userAgent: navigator.userAgent,
                duration: durationString,
            };

            setTimeLogs(prev => [...prev, newLog]);
            setStatus({ type: 'success', title: `Successfully Clocked ${action}`, details: `Your location has been recorded at ${now.toLocaleTimeString()}.${durationDetails}` });
            clearStatus();

        } catch (error: any) {
            const errorMessage = error.message || 'An unknown error occurred.';
            setLocation({ status: `Error: ${errorMessage}`, error: errorMessage });
            setStatus({ type: 'error', title: 'Location Error', details: `Could not get location: ${errorMessage}. Please enable location services and try again.` });
            clearStatus();
        } finally {
            setIsLogging(false);
        }
    };
    
    const handleAddAbsence = (date: string, reason: string) => {
        const { firstName, lastName, employeeId } = userInfo;
        if (!firstName || !lastName || !employeeId) {
            setStatus({ type: 'error', title: 'Missing Information', details: 'Please fill out your user info on the Time tab before logging an absence.' });
            clearStatus();
            return;
        }
        if (!date || !reason) {
             setStatus({ type: 'error', title: 'Missing Fields', details: 'Please provide both a date and a reason for the absence.' });
             clearStatus();
             return;
        }

        const newAbsence: AbsenceLog = { ...userInfo, date, reason, submitted: new Date().toLocaleString() };
        setAbsenceLogs(prev => [...prev, newAbsence]);
        setStatus({ type: 'success', title: 'Absence Logged', details: `Your absence for ${date} has been recorded.` });
        clearStatus();
    };

    const handleLogin = (success: boolean) => {
        setIsAdmin(success);
        if(!success) {
            setStatus({type: 'error', title: 'Login Failed', details: 'Incorrect username or password.'});
            clearStatus();
        }
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
                <Header />
                <div className="p-6">
                    {!isAdmin && <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />}
                    
                    {status && <StatusDisplay {...status} />}

                    {!isAdmin ? (
                        <>
                            {activeTab === Tab.Time && <TimePanel 
                                userInfo={userInfo} 
                                setUserInfo={setUserInfo} 
                                onLogAction={handleLogAction} 
                                location={location}
                                isLogging={isLogging}
                                />}
                            {activeTab === Tab.Absence && <AbsencePanel userInfo={userInfo} onAddAbsence={handleAddAbsence} />}
                            {activeTab === Tab.Timesheet && <TimesheetPanel logs={timeLogs} userInfo={userInfo} />}
                            <AdminLogin onLogin={handleLogin}/>
                        </>
                    ) : (
                        <AdminPanel logs={timeLogs} absences={absenceLogs} onLogout={() => setIsAdmin(false)} />
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
