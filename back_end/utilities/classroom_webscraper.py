from bs4 import BeautifulSoup
import requests
import json
import time

url_list = [
    "aquatic-ecosystems-research-laboratory-aerl",
    "allard-hall-alrd",
    "henry-angus-angu",
    "anthropology-and-sociology-anso",
    "auditorium-annex-audx",
    "biological-sciences-biol",
    "buchanan-buch",
    "civil-and-mechanical-engineering-ceme",
    "chemical-and-biological-engineering-building-chbe",
    "chemistry-chem",
    "centre-interactive-research-sustainability-cirs",
    "hugh-dempster-pavilion-dmp",
    "earth-and-ocean-sciences-eos",
    "earth-sciences-building-esb",
    "food-nutrition-and-health-fnh",
    "frank-forward-forw",
    "friedman-building-frdm",
    "forest-sciences-centre-fsc",
    "geography-geog",
    "hebb-hebb",
    "hennings-henn",
    "irving-k-barber-learning-centre-iblc",
    "iona-building-iona",
    "pa-woodward-instructional-resources-centre-irc",
    "frederic-lasserre-lasr",
    "ubc-life-building-life",
    "leonard-s-klinck-lsk",
    "mathematics-math",
    "mathematics-annex-matx",
    "macleod-mcld",
    "macmillan-mcml",
    "orchard-commons-orch",
    "robert-f-osborne-centre-osb1",
    "pharmaceutical-sciences-building-phrm",
    "ponderosa-commons-north-oakcedar-house-pcn",
    "neville-scarfe-scrf",
    "jack-bell-building-school-social-work-sowk",
    "school-population-and-public-health-spph",
    "west-mall-swing-space-swng",
    "leon-and-thea-koerner-university-centre-ucen",
    "wesbrook-wesb"
]

base_url = "https://learningspaces.ubc.ca/buildings/"

building_classroom_data = {}
building_data = []
address_list = []

for url in url_list:
    target_url = f"{base_url}{url}"
    response = requests.get(target_url)

    soup = BeautifulSoup(response.text, "html.parser")

    # find building name, address, hours, top-view, and classrooms
    # each classroom will have capacity and picture
    panels = soup.find_all(name="div", class_="col-xs-12")

    for panel in panels:
        building_name = panel.find("h1").getText()
        split_building_name = building_name.split()
        building_code = split_building_name[-1]
        building_code_without_brackets = building_code.replace("(", "").replace(")", "")

        split_text = building_name.split("(")
        only_building_name = split_text[0].strip()

        building_address = panel.find("div", class_="group-left").find_all("p")[1].text.strip()

        building_hours_raw = panel.find("div", class_="group-left").find_all("p")[2].text.strip()
        building_hours = building_hours_raw.replace("\u00a0", " ").replace("\n", ", ")

        top_view_img_tag = panel.find(name="img")
        top_view_img_url = top_view_img_tag["src"] if top_view_img_tag else ""

        # make list of classrooms
        classrooms = []
        classroom_elements = soup.find_all("div", class_="col-md-9")
        for classroom_element in classroom_elements:
            classroom_name = classroom_element.find("h2").text.strip()
            split_classroom_name = classroom_name.split()
            room_code = split_classroom_name[-1]
            capacity = classroom_element.find("p").text.strip().split("Capacity: ")[1]
            # img_tag = classroom_element.find(name="img")
            # img_url = img_tag["src"] if img_tag else ""
            classrooms.append({
                "room code": room_code,
                "building code": building_code_without_brackets,
                "building name": only_building_name,
                "address": building_address,
                "hours": building_hours,
                "capacity": capacity,
                # "classroom_image_url": img_url
            })

        classroom_pics = soup.find_all("div", class_="col-md-3")
        # add a loop to add each picture to each respective classroom
        for i, classroom_pic in enumerate(classroom_pics):
            img_tag = classroom_pic.find(name="img")
            img_url = img_tag["src"] if img_tag else ""
            # Check if there are classrooms to associate with the picture --> ChatGPT
            if i < len(classrooms):
                classrooms[i]["classroom_image_url"] = img_url

        building_classroom_data[building_code_without_brackets] = {
            # "address": building_address,
            # "hours": building_hours,
            # "top_view": top_view_img_url,
            "classrooms": classrooms
        }

        building_object = {
            "building_code" : building_code_without_brackets,
            "building_name" : only_building_name,
            "address" : building_address,
            "hours" : building_hours
        }
        
        address_list.append(building_address)

        building_data.append(building_object)

print(building_classroom_data)

# from https://www.geoapify.com/tutorial/geocoding-python

api_key = "0d15897763d64011921f58f48effb6d9"

# With Batch Geocoding, you create a geocoding job by sending addresses and then, after some time, get geocoding results by job id
# You may require a few attempts to get results. Here is a timeout between the attempts - 1 sec. Increase the timeout for larger jobs.
timeout = 1

# Limit the number of attempts
maxAttempt = 10

def getLocations(locations):
    url = "https://api.geoapify.com/v1/batch/geocode/search?apiKey=" + api_key
    response = requests.post(url, json = locations)
    result = response.json()

    # The API returns the status code 202 to indicate that the job was accepted and pending
    status = response.status_code
    if (status != 202):
        print('Failed to create a job. Check if the input data is correct.')
        return
    jobId = result['id']
    getResultsUrl = url + '&id=' + jobId

    time.sleep(timeout)
    result = getLocationJobs(getResultsUrl, 0)
    latitude_list = [entry.get('lat') for entry in result]
    longitude_list = [entry.get('lon') for entry in result]
    if (result):
        for i in range(len(building_data)):
            building_data[i]["lat"] = latitude_list[i]
            building_data[i]["lon"] = longitude_list[i]
        # print(len(latitude_list))
        # print(len(longitude_list))
        print('You can also get results by the URL - ' + getResultsUrl)
    else:
        print('You exceeded the maximal number of attempts. Try to get results later. You can do this in a browser by the URL - ' + getResultsUrl)

def getLocationJobs(url, attemptCount):
    response = requests.get(url)
    result = response.json()
    status = response.status_code
    if (status == 200):
        print('The job is succeeded. Here are the results:')
        return result
    elif (attemptCount >= maxAttempt):
        return
    elif (status == 202):
        print('The job is pending...')
        time.sleep(timeout)
        return getLocationJobs(url, attemptCount + 1)

getLocations(address_list)

with open("classroom_data.json", "w") as json_file:
    json.dump(building_classroom_data, json_file, indent=4)

with open("classroom_building_data.json", "w") as json_file:
    json.dump(building_data, json_file, indent=4)
