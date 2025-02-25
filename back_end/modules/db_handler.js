//Import necessary modules
const { cp } = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const mongo = require("mongodb");
const utils = require("./utils");
const { start, REPL_MODE_SLOPPY } = require('repl');
var geolib = require('geolib');
const axios = require('axios');


//Global Definitions
const DB_URL = 'mongodb://localhost:27017/';
const MODULE_NAME = "DBHandler";
var client;



/**
 * Initialize Database handler
 */
function dbh_init() {

    utils.consoleMsg(MODULE_NAME, "Initializing Database Handler");
    client = new MongoClient(DB_URL);
    try {
        client.connect().then(() => {
            utils.consoleMsg(MODULE_NAME, "Initialization successful");
        });
    } catch (err) {
        utils.consoleMsg(MODULE_NAME, "Initialziation Failed. See error message below.");
        console.log(err);
    }
}

/**
 * Deinitialize Database handler
 */
async function dbh_deinit() {
    await client.close();
    utils.consoleMsg(MODULE_NAME, 'Connection closed');
}


// get rooms request database handling function
async function getRooms(building_code, dbName) {
    const collection = client.db(dbName).collection(building_code);
    const data = await collection.find({}).toArray()
    if (data.length !== 0) {
        if (building_code === 'building_all') {
            delete data[0]._id
        }
        return data
    }
    var err = new Error("Not Found")
    err.statusCode = 404
    throw err
}

/**
 * Get a specific romm's data
 * @param {string} building_code 
 * @param {string} room_num 
 * @param {string} dbName 
 */
async function getRoom(buildingCode, roomNum, dbName) {

    const collection = client.db(dbName).collection(buildingCode);
    const result = await collection.findOne({ _id: roomNum });
    return result;
}

// Gets the timeslots data for a given date of a particular room
async function getSlots(slotsData) {
    const collection = client.db('study_room_db').collection(slotsData.buildingCode);
    const roomData = await collection.findOne({ _id: slotsData.roomNo })

    if (!roomData) {
        var err = new Error("Room Not Found")
        err.statusCode = 404
        throw err
    }

    const bookingCollection = client.db('study_room_db').collection('bookings')
    const [validDate, day] = dateTimeValidator(slotsData.date, "2359")

    if (!validDate) {
        var err = new Error("Invalid Date")
        err.statusCode = 404
        throw err
    }

    const bookingData = await bookingCollection.findOne({ _id: slotsData.date })
    const roomCode = slotsData.buildingCode + " " + slotsData.roomNo

    if (!bookingData || !(bookingData[roomCode])) {
        var data = createSlots(roomData.open_times[day], roomData.close_times[day])
    } else {
        var data = bookingData[roomCode]
        for (let i = 0; i < 48; i++) {
            if (data[i] != "2" && data[i] != "0") {
                data[i] = "1"
            }
        }
    }

    return data.join('')
}

// book room request database handling function
async function bookStudyRooms(bookingData) {
    const startTime = parseInt(bookingData.startTime)
    const endTime = parseInt(bookingData.endTime)
    const date = bookingData.date
    const [validDate, day] = dateTimeValidator(date, bookingData.startTime)
    var validTimes = timeValidator(startTime, endTime)

    if ((!validDate) || (!validTimes)) {
        var err = new Error("Invalid Date/Time")
        err.statusCode = 404
        throw err
    }

    const buildingCollection = client.db('study_room_db').collection(bookingData.buildingCode);
    const room = await buildingCollection.findOne({ _id: bookingData.roomNo })
    if (!room) {
        var err = new Error("Room Not Found")
        err.statusCode = 404
        throw err
    }

    const roomOpenTime = room.open_times[day]
    const roomCloseTime = room.close_times[day]


    if ((roomOpenTime > startTime) || (roomCloseTime < endTime)) {
        var err = new Error("Invalid Timeslots")
        err.statusCode = 404
        throw err
    }


    const userCollection = client.db('users').collection('users')
    const bookingCollection = client.db('study_room_db').collection('bookings')
    const userBookingCollection = client.db('users').collection('bookings')

    const bookingOriginal = await bookingCollection.findOne({ _id: date })

    var bookingsDate = JSON.parse(JSON.stringify(bookingOriginal))

    const roomCode = bookingData.buildingCode + " " + bookingData.roomNo
    if (!bookingOriginal) {
        bookingsDate = {
            _id: date,
        }
    }

    if (!(bookingsDate[roomCode])) {
        var timeSlotsCode = createSlots(roomOpenTime, roomCloseTime)
        bookingsDate[roomCode] = timeSlotsCode
    }

    const startIndex = Math.ceil(startTime / 50)
    const endIndex = Math.ceil(endTime / 50)

    for (let i = startIndex; i < endIndex; i++) {
        if (bookingsDate[roomCode][i] != "0") {
            var err = new Error("Unavailable Timeslots")
            err.statusCode = 403
            throw err
        }
    }

    for (let i = startIndex; i < endIndex; i++) {
        bookingsDate[roomCode][i] = bookingData.email
    }

    try {
        if (!bookingOriginal) {
            await bookingCollection.insertOne(bookingsDate)
        } else {
            await bookingCollection.updateOne(bookingOriginal, { $set: bookingsDate })
        }
    } catch (error) {
        var err = new Error("Unavailable Timeslots")
        err.statusCode = 403
        throw err
    }

    var userbookingdata = {
        roomCode: roomCode,
        startIndex: startIndex,
        endIndex: endIndex,
        date: date,
        waitlist: []
    }

    const result = await userBookingCollection.insertOne(userbookingdata)


    var user = await userCollection.findOne({ _id: bookingData.email })
    user.booking_ids.push(result.insertedId)
    await userCollection.updateOne({ _id: bookingData.email }, { $set: user })


    return "booked!"
}

/**
 * 
 */
async function updateBooking(date, roomCode, data) {

    const collection = client.db('study_room_db').collection('bookings');
    try {
        const result = await collection.findOneAndUpdate(
            { _id: date },
            { $set: { roomCode: data } }
        );
        return result.ok == 1 && result.value != null;
    } catch (err) {
        utils.consoleMsg(MODULE_NAME, 'Failed to update booking data');
        utils.consoleMsg(MODULE_NAME, `ErrMsg:\n${err}`);
        return false;
    }
}


async function filterRooms(filterData) {
    const roomdb = client.db('study_room_db')
    const bookingRoomsdb = client.db('study_room_db')

    const buildings = await roomdb.collection('building_all').find().toArray()

    const roomList = {
        rooms: [],
        distances: [],
    }

    const startIndex = Math.ceil((filterData.startTime) / 50)
    const endIndex = parseInt(startIndex + (parseFloat(filterData.duration) * 2))

    for (let i = 0; i < buildings[0].buildings.length; i++) {
        const rooms = await roomdb.collection(buildings[0].buildings[i].building_code).find().toArray()
        const buildingCode = buildings[0].buildings[i].building_code

        const distance = geolib.getDistance({
            latitude: buildings[0].buildings[i].lat,
            longitude: buildings[0].buildings[i].lon
        }, {
            latitude: filterData.lat,
            longitude: filterData.lon
        }, accuracy = .1)

        for (let j = 0; j < rooms.length; j++) {
            const slotsData = {
                date: filterData.day,
                buildingCode: buildingCode,
                roomNo: rooms[j]._id,
            }
            const slots = await getSlots(slotsData)
            var flag = true
            for (let k = startIndex; k < endIndex; k++) {
                if (slots[k] != 0) {
                    flag = false
                    break
                }
            }
            if (flag) {
                roomList.rooms.push(rooms[j])
                roomList.distances.push(distance)
            }
        }
    }
    const indices = roomList.distances.map((_, index) => index);

    indices.sort((a, b) => roomList.distances[a] - roomList.distances[b]);
    const sortedRooms = indices.map(index => roomList.rooms[index]);
    return sortedRooms;
}

async function userLogin(userInfo) {
    const users = client.db('users').collection('users');
    const user = await users.findOne({ _id: userInfo._id })
    if (user) {
        await users.updateOne({ _id: userInfo._id }, { $push: { tokens: userInfo.devToken } })
        data = 'User exists'
        return data
    }
    await users.insertOne(userInfo);
    data = 'User information saved'
    return data
}


async function checkUser(userEmail) {
    const users = client.db('users').collection('users');
    const user = await users.findOne({ _id: userEmail })
    if (user) {
        return user
    } else {
        var err = new Error("Unauthorized")
        err.statusCode = 401
        throw err
    }
}


async function getBookings(IDs) {
    const collection = client.db('users').collection('bookings');

    const documents = await collection.find({ _id: { $in: IDs } }).toArray();

    for (let i = 0; i < documents.length; i++) {
        documents[i].startTime = documents[i].startIndex * 50
        documents[i].endTime = (documents[i].endIndex) * 50
        if (documents[i].startIndex % 2 == 1) {
            documents[i].startTime -= 20
        }
        if ((documents[i].endIndex) % 2 == 1) {
            documents[i].endTime -= 20
        }
        documents[i].startTime = timeConvertor(documents[i].startTime)
        documents[i].endTime = timeConvertor(documents[i].endTime)
        delete documents[i].waitlist
        delete documents[i].startIndex
        delete documents[i].endIndex
    }
    return documents
}

async function cancelBooking(ID, user) {

    const userCollection = client.db('users').collection('users');
    const userBookingCollection = client.db('users').collection('bookings');
    const bookingCollection = client.db('study_room_db').collection('bookings');

    for (let i = 0; i < user.booking_ids.length; i++) {
        if (user.booking_ids[i].toHexString() === ID) {
            ID = user.booking_ids[i]
        }
    }

    if (!(ID instanceof ObjectId)) {
        var err = new Error("Booking not Found")
        err.statusCode = 404
        throw err
    }

    const booking = await userBookingCollection.findOne({ _id: ID })

    const bookingsDateOriginal = await bookingCollection.findOne({ _id: booking.date })

    var bookingsDate = JSON.parse(JSON.stringify(bookingsDateOriginal))
    let roomCode = booking.roomCode

    for (let i = booking.startIndex; i < booking.endIndex; i++) {
        bookingsDate[roomCode][i] = "0"
    }
    try {
        await bookingCollection.updateOne(bookingsDateOriginal, { $set: bookingsDate })
    } catch (error) {
        var err = new Error("Could not complete request")
        err.statusCode = 404
        throw err
    }

    await userBookingCollection.deleteOne({ _id: ID });

    const user1 = await userCollection.findOne({ _id: user._id })
    let filteredList = user1.booking_ids.filter(item => item.toHexString() !== ID.toHexString())
    user1.booking_ids = filteredList
    await userCollection.updateOne({ _id: user._id }, { $set: user1 })

    return "Removed"
}

async function confirmBooking(confirmData) {
    const userBookingCollection = client.db('users').collection('bookings');
    const bookingCollection = client.db('study_room_db').collection('bookings');
    const roomdb = client.db('study_room_db')
    const user = confirmData.user


    for (let i = 0; i < user.booking_ids.length; i++) {
        if (user.booking_ids[i].toHexString() === confirmData.ID) {
            ID = user.booking_ids[i]
        }
    }


    if (!(ID instanceof ObjectId)) {
        var err = new Error("Booking not Found")
        err.statusCode = 404
        throw err
    }


    const booking = await userBookingCollection.findOne({ _id: ID })

    const buildingCode = booking.roomCode.split(" ")[0];

    const buildings = await roomdb.collection('building_all').find().toArray()
    const rooms = buildings[0].buildings

    for (let i = 0; i < rooms.length; i++) {
        if (rooms[i].building_code === buildingCode) {
            var end = {
                latitude: rooms[i].lat,
                longitude: rooms[i].lon
            }
        }
    }

    dist = geolib.getDistance({
        latitude: confirmData.lat,
        longitude: confirmData.lon
    }, end, accuracy = .1)

    if (dist < 200) {
        const bookingsDateOriginal = await bookingCollection.findOne({ _id: booking.date })

        var bookingsDate = JSON.parse(JSON.stringify(bookingsDateOriginal))
        let roomCode = booking.roomCode

        for (let i = booking.startIndex; i < booking.endIndex; i++) {
            bookingsDate[roomCode][i] = "3"
        }

        try {
            await bookingCollection.updateOne(bookingsDateOriginal, { $set: bookingsDate })
        } catch (error) {
            var err = new Error("Could not complete request")
            err.statusCode = 404
            throw err
        }

        await userBookingCollection.updateOne({ _id: ID }, { $set: { confirmed: true } })
        return "confirmed"
    } else {
        var error = new Error("Looks like you are far away")
        error.statusCode = 400
        throw error
    }
}


function commentUploader(comment) {
    const building = comment.building;
    const room = comment.room;
    const comment_new = comment.comment;
    const db = client.db('study_room_db');
    console.log(comment_new);
    if (!db.listCollections({ name: building }).hasNext()) {
        return false;
    }
    const collection = db.collection(building);
    if (!collection.find({ _id: room }).hasNext()) {
        return false;
    }

    collection.updateOne({ _id: room }, { $push: { comments: comment_new } }).then(
        (err) => {
            if (err) {
                return false;
            }
        }
    );
    return true;

}

/**
 * Upload room reports to the database
 * @param {*} reportData 
 */
function submitReport(reportData) {

    const db = client.db('study_room_db');
    const collection = db.collection("room_reports");
    var status;
    collection.insertOne(reportData).then(
        res => {

        }
    ).catch(
        err => {
            throw err;
        }
    );

}

//Administration related functions

/**
 * Assign a user with admin permission
 * @param {string} email User Email
 * @returns {string} True on success, False on Failure.
 */
async function addAdmin(email) {

    /*
    We assign admin permission to the user whose email match the email given.
    If there are no such a user, we just do nothing and return false.
    */

    const collection = client.db('users').collection('users');
    const result = await collection.updateOne({ _id: email }, { $set: { type: 'admin' } });
    return result.acknowledged && result.modifiedCount == 1;

}

async function delAdmin(email) {

    const collection = client.db('users').collection('users');
    const result = await collection.updateOne({ _id: email }, { $set: { type: 'user' } });
    return result.acknowledged && result.modifiedCount == 1;
}

async function addBuildingAdmin(email, building) {

    const collection = client.db('users').collection('users');
    try {
        const result = await collection.updateOne({ _id: email }, { $push: { adminBuildings: building } });
        return result.acknowledged && result.modifiedCount == 1;
    } catch (err) {
        return false;
    }

}

async function delBuildingAdmin(email, building) {

    const collection = client.db('users').collection('users');
    try {
        const result = await collection.updateOne({ _id: email }, { $pull: { adminBuildings: building } });
        return result.acknowledged && result.modifiedCount == 1;
    } catch (err) {
        return false;
    }

}

async function getAdminBuildings(email) {

    const collection = client.db('users').collection('users');
    try {
        const result = await collection.findOne({ _id: email });
        if (result == null || result.type != 'admin') {
            return null;
        }
        return result.adminBuildings;
    } catch (err) {
        return null;
    }

}

async function addBuilding(buildingData) {
    const buildingCollection = client.db("study_room_db").collection("building_all")
    const buildings = await buildingCollection.find().toArray()
    const buildingList = buildings[0].buildings

    const coordinates = await getCoordinates(buildingData.building_address)
    buildingData.lat = parseFloat(coordinates.lat)
    buildingData.lon = parseFloat(coordinates.lon)

    try {
        await buildingCollection.updateOne({ _id: buildings[0]._id }, { $push: { buildings: buildingData } });
        return "Successfully added"
    } catch (err) {
        var error = new Error("Server error, please retry")
        error.statusCode = 403
        throw error
    }

}

async function delBuilding(buildingCode) {
    const buildingCollection = client.db("study_room_db").collection("building_all")
    var buildings = await buildingCollection.findOne({ type: 'all_studyroom_buildings' })
    for (let building in buildings.buildings) {
        if (buildings.buildings[building].building_code == buildingCode) {
            var target = buildings.buildings[building]
        }
    }

    if (!target) {
        var error = new Error("No building found")
        error.statusCode = 404
        throw error
    }

    try {
        await buildingCollection.updateOne({ _id: buildings._id }, { $pull: { buildings: target } });
        await client.db("study_room_db").collection(buildingCode).drop();
        return "Successfully removed"
    } catch (err) {
        var error = new Error("Server error, please retry")
        error.statusCode = 403
        throw error
    }

}

async function addRoom(roomData) {
    const buildingCollection = client.db("study_room_db").collection("building_all")
    const buildings = await buildingCollection.find().toArray()
    const buildingList = buildings[0].buildings
    var buildingDetails = {}
    for (let building in buildingList) {
        if (building.building_code == roomData.building_code) {
            buildingDetails = building
        }
    }

    roomData.open_times = buildingDetails.open_times
    roomData.close_times = buildingDetails.close_time
    roomData.building_name = buildingDetails.building
    roomData.building_address = buildingDetails.address
    roomData.comments = []

    try {
        await client.db("study_room_db").collection(roomData.building_code).insertOne({ roomData });
        return "Successfully added"
    } catch (err) {
        var error = new Error("Room number exists already")
        error.statusCode = 400
        throw error
    }

}

async function addRoom(roomData) {
    const buildingCollection = client.db("study_room_db").collection("building_all")
    const buildings = await buildingCollection.find().toArray()
    const buildingList = buildings[0].buildings
    var buildingDetails = {}
    for (let building in buildingList) {
        if (building.building_code == roomData.building_code) {
            buildingDetails = building
        }
    }

    roomData.open_times = buildingDetails.open_times
    roomData.close_times = buildingDetails.close_time
    roomData.building_name = buildingDetails.building
    roomData.building_address = buildingDetails.address
    roomData.comments = []

    try {
        await client.db("study_room_db").collection(roomData.building_code).insertOne({ roomData });
        return "Successfully added"
    } catch (err) {
        var error = new Error("Room number exists already")
        error.statusCode = 400
        throw error
    }

}

async function delRoom(roomData) {
    try {
        await client.db("study_room_db").collection(roomData.building_code).deleteOne({ _id: roomData.roomNo });
        return "Successfully removed"
    } catch (err) {
        var error = new Error("Room number does not exist")
        error.statusCode = 400
        throw error
    }
}

//Firebase & notification related functions

/**
 * Find all device token relates to a user
 * @param {string} email 
 * @returns 
 */
async function findUserDevToken(email) {
    //Test required

    const collection = client.db('users').collection('users');
    try {
        const result = await collection.findOne({ _id: email });
        if (result == null || result.devTokens == null) {
            return null;
        }
        return result.devTokens;
    } catch (err) {
        return null;
    }

}

async function updateUserTokens(email, newTokens) {

    const collection = client.db('users').collection('users');
    try {
        const result = collection.findOneAndUpdate(
            { _id: email },
            { $set: { tokens: newTokens } }
        );
        return result.ok == 1 && result.value != null;
    } catch (err) {
        utils.serverLog(MODULE_NAME, `Failed to update user ${email}'s tokens!`);
        utils.serverLog(MODULE_NAME, `ErrMessage:\n${err}`);
        return false;
    }

}

/**
 * Find all bookings by date
 * @param {string} date 
 * @returns A List of booking documents
 */
async function findBookingByDate(date) {
    //Test required

    const collection = client.db('study_room_db').collection('bookings');
    try {
        const booking = await collection.findOne({ _id: date });
        return booking;
    } catch (err) {
        return null;
    }

}



// Helper Functions

// Checks if the booking date is after now and less than 2 weeks from now 
// Additionally returns the day of the week of date

function dateTimeValidator(date, startTime) {
    var formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Vancouver' });
    var inputDateParts = date.split('-');
    var inputDate = new Date(inputDateParts[2], inputDateParts[1] - 1, inputDateParts[0]);

    var currentDate = formatter.format(new Date());
    var currentDateTime = new Date(currentDate);

    // Convert startTime to hours and minutes
    var inputHours = parseInt(startTime.slice(0, 2));
    var inputMinutes = parseInt(startTime.slice(2));

    // Set the hours and minutes of the inputDate
    inputDate.setHours(inputHours);
    inputDate.setMinutes(inputMinutes);


    // Check if the input date is within 14 days from now, considering the day of the week
    var daysDifference = (inputDate - currentDateTime) / (1000 * 60 * 60 * 24);
    var isValid = daysDifference >= 0 && daysDifference <= 14;

    var dayOfWeek = inputDate.getDay() - 1;

    if (dayOfWeek < 0) {
        dayOfWeek = 6
    }

    return [isValid, dayOfWeek];
}

function timeValidator(startTime, endTime) {
    if ((endTime < startTime) || (((endTime - startTime) / 300) > 1)
        || (!(2400 >= endTime >= 0)) || (!(2400 >= startTime >= 0))
        || ((endTime % 100 != 0) && (endTime % 100 != 30))
        || ((startTime % 100 != 0) && (startTime % 100 != 30))) {
        return false
    } else {
        return true
    }
}

function createSlots(roomOpenTime, roomCloseTime) {
    var timeSlotsCode = []
    const openIndex = Math.ceil(roomOpenTime / 50)
    const closeIndex = Math.ceil(roomCloseTime / 50) - 1
    for (let i = 0; i < 48; i++) {
        if ((i < openIndex) || (i > closeIndex)) {
            timeSlotsCode.push("2")
        } else {
            timeSlotsCode.push("0")
        }
    }
    return timeSlotsCode
}

function timeConvertor(time) {
    return time.toString().padStart(4, '0');
}

async function getCoordinates(address) {
    try {
        const response = await axios.get(`https://api.opencagedata.com/geocode/v1/json`, {
            params: {
                q: address,
                key: process.env.OPEN_CAGE_API_TOKEN
            }
        });

        if (response.data.results.length > 0) {
            const location = response.data.results[0].geometry;
            const lat = location.lat;
            const lon = location.lng;
            return { lat, lon };
        } else {
            throw new Error('No results found');
        }
    } catch (error) {
        throw new Error('Error fetching data from OpenCage Data API');
    }
}



// Interface exports

module.exports = {
    dbh_init,
    dbh_deinit,
    getRooms,
    userLogin,
    checkUser,
    bookStudyRooms,
    filterRooms,
    confirmBooking,
    getSlots,
    getBookings,
    commentUploader,
    cancelBooking,
    getRoom,
    submitReport,
    addAdmin,
    delAdmin,
    addBuildingAdmin,
    delBuildingAdmin,
    getAdminBuildings,
    findUserDevToken,
    findBookingByDate,
    updateUserTokens,
    updateBooking,
    delBuilding,
    addBuilding,
    addRoom,
    delRoom
};
