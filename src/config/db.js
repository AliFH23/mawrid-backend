import mongoose from 'mongoose';
import dns from 'dns';

// forces Node's own DNS resolver to use Google/Cloudflare DNS directly, bypassing
// whatever the OS-level resolver is doing — works around a known Node.js-on-Windows
// bug where SRV lookups (which MongoDB Atlas's mongodb+srv:// URIs depend on) fail
// even when the OS's own DNS resolution works fine (confirmed via nslookup)
dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Database connection failed: ${error.message}`);
    process.exit(1); // stop the server entirely if we can't connect, no point continuing without a database
  }
};

export default connectDB;