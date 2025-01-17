from connect import *

import psycopg2.extras
from datetime import datetime
from datetime import timedelta
import pandas as pd
from pprint import pprint


'''
Create missions for the assigned routes if it doesn't exist. 
This program is only meant to simulate creating HITs having a 1-to-1 mapping with the routes.
'''


def create_missions_for_routes(engine, cursor, route_rows):

    # Get all the current route_id in  sidewalk.route
    cursor.execute("""SELECT * from sidewalk.mission where label = 'mturk-mission'""")
    mturk_mission_rows = cursor.fetchall()
    db_region_id_list = map(lambda x: x["region_id"], mturk_mission_rows)
    route_region_id_list = map(lambda x: x["region_id"], route_rows)

    mission_rows_to_insert = []
    db_inserted_region_id_list = []
    for region_id in route_region_id_list:
        if (region_id not in db_region_id_list and
                region_id not in db_inserted_region_id_list):
            # Insert into mission table
            mission_rows_to_insert.append({
                'region_id': region_id,
                'label': 'mturk-mission',
                'level': 1,
                'deleted': False,
                'coverage': None,
                'distance': 304.8,
                'distance_ft': 1000,
                'distance_mi': 0.189394
            })
            mission_rows_to_insert.append({
                'region_id': region_id,
                'label': 'mturk-mission',
                'level': 2,
                'deleted': False,
                'coverage': None,
                'distance': 609.6,
                'distance_ft': 2000,
                'distance_mi': 0.378788
            })
            mission_rows_to_insert.append({
                'region_id': region_id,
                'label': 'mturk-mission',
                'level': 3,
                'deleted': False,
                'coverage': None,
                'distance': 1219.2,
                'distance_ft': 4000,
                'distance_mi': 0.757576
            })
            db_inserted_region_id_list.append(region_id)
            print "Mission created for region", region_id

    mission_table_df = pd.DataFrame(mission_rows_to_insert)
    mission_table_df.to_sql('mission', engine, if_exists='append', index=False)


'''
    Assign routes to the newly created HITs.
    The RequesterAnnotation attribute of the HIT stores the associated route_id
'''


def assign_routes_to_hits(engine, routes):

    hit_route_map = []

    print "Total HITs:", len(routes)

    for route_id in routes:
        hit_route_map.append({'hit_id': route_id, 'route_id': route_id})

    hit_route_df = pd.DataFrame(hit_route_map)
    hit_route_df.to_sql('amt_route_assignment', engine,
                        if_exists='append', index=False)


if __name__ == '__main__':
    
    try:
        # Connect to PostgreSQL database
        conn, engine = connect_to_db()

        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Get all the current route_ids in  sidewalk.route
        cur.execute(
            """SELECT route_id, region_id from sidewalk.route order by street_count desc""")
        route_rows = cur.fetchall()
        routes = map(lambda x: x["route_id"], route_rows)

        # Get the list of HITs created, assign routes to HITs
        # assign_routes_to_hits(engine, routes)

        # Insert into Mission Table - create new mission for a route (if it doesn't exist)
        create_missions_for_routes(engine, cur, route_rows)
        
    except Exception as e:
        print "Error: ", e
